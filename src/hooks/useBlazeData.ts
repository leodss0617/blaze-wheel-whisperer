import { useState, useEffect, useCallback, useRef } from 'react';
import { BlazeRound, BlazeStats, PredictionSignal, ConnectionStatus, BlazeColor } from '@/types/blaze';
import { calculateStats, analyzePatternsAndPredict, generateMockRounds } from '@/lib/blazeAnalyzer';
import { useToast } from '@/hooks/use-toast';
import { useAlertSound } from '@/hooks/useAlertSound';
import { useAIPrediction, AIPrediction, AIStats } from '@/hooks/useAIPrediction';
import { supabase } from '@/integrations/supabase/client';

const POLL_INTERVAL = 3000; // Poll every 3 seconds

interface BlazeAPIGame {
  id: string;
  color: number; // 0 = white, 1 = red, 2 = black
  roll: number;
  created_at: string;
  server_seed?: string;
}

export function useBlazeData() {
  const [rounds, setRounds] = useState<BlazeRound[]>([]);
  const [stats, setStats] = useState<BlazeStats | null>(null);
  const [signals, setSignals] = useState<PredictionSignal[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastProcessedId, setLastProcessedId] = useState<string | null>(null);
  const [useAI, setUseAI] = useState(true);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const aiPredictionRef = useRef<number>(0);
  const { toast } = useToast();
  const { playAlertSound } = useAlertSound();
  const { getAIPrediction, isLoading: isAILoading, lastPrediction: aiPrediction, aiStats } = useAIPrediction();

  // Calculate stats when rounds change
  useEffect(() => {
    if (rounds.length > 0) {
      const newStats = calculateStats(rounds);
      setStats(newStats);
    }
  }, [rounds]);

  // Save round to database
  const saveRoundToDb = useCallback(async (round: BlazeRound) => {
    try {
      await supabase.from('blaze_rounds').upsert({
        blaze_id: round.id,
        color: round.color,
        number: round.number,
        round_timestamp: round.timestamp.toISOString(),
      }, { onConflict: 'blaze_id' });
    } catch (error) {
      console.error('Error saving round to DB:', error);
    }
  }, []);

  // Save signal to database
  const saveSignalToDb = useCallback(async (signal: PredictionSignal) => {
    try {
      await supabase.from('prediction_signals').insert({
        predicted_color: signal.predictedColor,
        confidence: signal.confidence,
        reason: signal.reason,
        protections: signal.protections,
        status: signal.status,
        actual_result: signal.actualResult || null,
        signal_timestamp: signal.timestamp.toISOString(),
      });
    } catch (error) {
      console.error('Error saving signal to DB:', error);
    }
  }, []);

  // Update signal in database
  const updateSignalInDb = useCallback(async (signal: PredictionSignal) => {
    try {
      // Find by timestamp since we don't have DB id
      await supabase.from('prediction_signals')
        .update({
          status: signal.status,
          protections: signal.protections,
          actual_result: signal.actualResult || null,
        })
        .eq('signal_timestamp', signal.timestamp.toISOString());
    } catch (error) {
      console.error('Error updating signal in DB:', error);
    }
  }, []);

  // Generate prediction when new round arrives
  const checkForSignal = useCallback(async (currentRounds: BlazeRound[]) => {
    // Increment AI prediction counter
    aiPredictionRef.current++;
    
    // Use AI prediction every 5 rounds or if useAI is enabled
    const shouldUseAI = useAI && aiPredictionRef.current % 5 === 0;
    
    if (shouldUseAI) {
      console.log('Requesting AI prediction...');
      const aiSignal = await getAIPrediction();
      if (aiSignal) {
        setSignals(prev => {
          saveSignalToDb(aiSignal);
          return [...prev.slice(-19), aiSignal];
        });
        return;
      }
    }
    
    // Fallback to pattern-based prediction
    const prediction = analyzePatternsAndPredict(currentRounds);
    if (prediction) {
      // Check if we should add this signal (not too frequent)
      setSignals(prev => {
        const lastSignal = prev[prev.length - 1];
        const timeSinceLastSignal = lastSignal 
          ? Date.now() - lastSignal.timestamp.getTime() 
          : Infinity;
        
        if (timeSinceLastSignal > 30000 || !lastSignal) {
          const isHighConfidence = prediction.confidence >= 75;
          
          // Play alert sound
          playAlertSound(isHighConfidence);
          
          // Save signal to database
          saveSignalToDb(prediction);
          
          toast({
            title: isHighConfidence ? '🔥 SINAL FORTE!' : '🎯 Novo Sinal Gerado!',
            description: `Apostar em ${prediction.predictedColor === 'red' ? 'VERMELHO' : 'PRETO'} - Confiança: ${prediction.confidence}%`,
          });
          return [...prev.slice(-19), prediction];
        }
        return prev;
      });
    }
  }, [toast, playAlertSound, saveSignalToDb, useAI, getAIPrediction]);

  // Update signal status based on actual results
  useEffect(() => {
    if (rounds.length > 0 && signals.length > 0) {
      const lastRound = rounds[rounds.length - 1];
      
      setSignals(prev => prev.map(signal => {
        if (signal.status !== 'pending') return signal;
        
        // Check if this signal was for a recent round
        const signalAge = Date.now() - signal.timestamp.getTime();
        if (signalAge > 120000) {
          const updated = { ...signal, status: 'loss' as const, actualResult: lastRound.color };
          updateSignalInDb(updated);
          return updated;
        }
        
        // Check if the prediction was correct
        if (lastRound.timestamp > signal.timestamp) {
          if (lastRound.color === signal.predictedColor) {
            const updated = { ...signal, status: 'win' as const };
            updateSignalInDb(updated);
            return updated;
          } else if (signal.protections > 0) {
            const updated = { ...signal, protections: signal.protections - 1 };
            updateSignalInDb(updated);
            return updated;
          } else {
            const updated = { ...signal, status: 'loss' as const, actualResult: lastRound.color };
            updateSignalInDb(updated);
            return updated;
          }
        }
        
        return signal;
      }));
    }
  }, [rounds, updateSignalInDb]);

  const convertBlazeGame = (game: BlazeAPIGame): BlazeRound => {
    const colorMap: Record<number, BlazeColor> = {
      0: 'white',
      1: 'red',
      2: 'black',
    };
    
    return {
      id: game.id,
      color: colorMap[game.color] || 'red',
      number: game.roll,
      timestamp: new Date(game.created_at),
    };
  };

  const fetchBlazeData = useCallback(async (isInitial = false) => {
    try {
      console.log('Fetching Blaze data...');
      
      const { data, error } = await supabase.functions.invoke('blaze-proxy', {
        body: {},
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      if (!data || (Array.isArray(data) && data.length === 0)) {
        console.log('No data received from Blaze');
        return;
      }

      const games: BlazeAPIGame[] = Array.isArray(data) ? data : [data];
      console.log(`Received ${games.length} games from Blaze`);

      // Convert and sort games by timestamp (oldest first)
      const newRounds = games
        .map(convertBlazeGame)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      if (isInitial) {
        setRounds(newRounds);
        // Save all initial rounds to DB
        newRounds.forEach(round => saveRoundToDb(round));
        if (newRounds.length > 0) {
          setLastProcessedId(newRounds[newRounds.length - 1].id);
        }
      } else {
        // Find new rounds that we haven't processed yet
        setRounds(prev => {
          const existingIds = new Set(prev.map(r => r.id));
          const actuallyNewRounds = newRounds.filter(r => !existingIds.has(r.id));
          
          if (actuallyNewRounds.length > 0) {
            console.log(`Found ${actuallyNewRounds.length} new rounds`);
            // Save new rounds to DB
            actuallyNewRounds.forEach(round => saveRoundToDb(round));
            
            const updated = [...prev, ...actuallyNewRounds].slice(-100);
            
            // Check for signals with new data
            setTimeout(() => checkForSignal(updated), 100);
            
            return updated;
          }
          return prev;
        });
      }

    } catch (error) {
      console.error('Error fetching Blaze data:', error);
      if (connectionStatus === 'connected') {
        setConnectionStatus('error');
        toast({
          title: '❌ Erro ao buscar dados',
          description: 'Tentando reconectar...',
          variant: 'destructive',
        });
      }
    }
  }, [connectionStatus, toast, checkForSignal, saveRoundToDb]);

  const connectToBlaze = useCallback(async () => {
    if (pollIntervalRef.current) {
      return;
    }

    setConnectionStatus('connecting');
    
    try {
      // Initial fetch
      await fetchBlazeData(true);
      
      setConnectionStatus('connected');
      toast({
        title: '✅ Conectado à Blaze',
        description: 'Recebendo dados em tempo real',
      });

      // Start polling for updates
      pollIntervalRef.current = setInterval(() => {
        fetchBlazeData(false);
      }, POLL_INTERVAL);

    } catch (error) {
      console.error('Connection error:', error);
      setConnectionStatus('error');
      toast({
        title: '❌ Erro de conexão',
        description: 'Não foi possível conectar à Blaze. Tente o modo simulação.',
        variant: 'destructive',
      });
    }
  }, [fetchBlazeData, toast]);

  const disconnect = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setConnectionStatus('disconnected');
  }, []);

  // Simulation mode for testing
  const startSimulation = useCallback(() => {
    if (isSimulating) return;
    
    setIsSimulating(true);
    setConnectionStatus('connected');
    
    // Generate initial data
    const initialRounds = generateMockRounds(30);
    setRounds(initialRounds);
    
    toast({
      title: '🎮 Modo Simulação',
      description: 'Gerando dados de teste',
    });

    // Add new rounds periodically
    simulationIntervalRef.current = setInterval(() => {
      setRounds(prev => {
        const newRound = generateMockRounds(1)[0];
        newRound.timestamp = new Date();
        newRound.id = crypto.randomUUID();
        const updated = [...prev, newRound].slice(-100);
        checkForSignal(updated);
        return updated;
      });
    }, 5000);
  }, [isSimulating, toast, checkForSignal]);

  const stopSimulation = useCallback(() => {
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }
    setIsSimulating(false);
    setConnectionStatus('disconnected');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
      stopSimulation();
    };
  }, [disconnect, stopSimulation]);

  return {
    rounds,
    stats,
    signals,
    connectionStatus,
    isSimulating,
    connectToBlaze,
    disconnect,
    startSimulation,
    stopSimulation,
    // AI features
    useAI,
    setUseAI,
    isAILoading,
    aiPrediction,
    aiStats,
    getAIPrediction,
  };
}
