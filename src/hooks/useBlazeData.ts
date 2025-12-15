import { useState, useEffect, useCallback, useRef } from 'react';
import { BlazeRound, BlazeStats, PredictionSignal, ConnectionStatus, BlazeColor, PredictionState } from '@/types/blaze';
import { calculateStats, analyzePatternsAndPredict, generateMockRounds } from '@/lib/blazeAnalyzer';
import { useToast } from '@/hooks/use-toast';
import { useAlertSound } from '@/hooks/useAlertSound';
import { useAIPrediction, AIPrediction, AIStats } from '@/hooks/useAIPrediction';
import { supabase } from '@/integrations/supabase/client';

const POLL_INTERVAL = 3000; // Poll every 3 seconds
const MAX_GALES = 2; // Maximum number of gales

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
  const [predictionInterval, setPredictionInterval] = useState(60); // Default 60 seconds
  
  // Prediction state management
  const [predictionState, setPredictionState] = useState<PredictionState>('analyzing');
  const [currentPrediction, setCurrentPrediction] = useState<PredictionSignal | null>(null);
  const [galeLevel, setGaleLevel] = useState(0);
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const waitingForResult = useRef(false);
  const isGeneratingPrediction = useRef(false);
  const lastPredictionTime = useRef<number>(0);
  
  const { toast } = useToast();
  const { playAlertSound } = useAlertSound();
  const { getAIPrediction, isLoading: isAILoading, lastPrediction: aiPrediction, aiStats, consecutiveLosses, isRecalibrating, recordWin, recordLoss } = useAIPrediction();

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

  // Handle win - reset to analyzing
  const handleWin = useCallback((signal: PredictionSignal) => {
    console.log('WIN! Resetting to analyzing mode');
    const updated = { ...signal, status: 'win' as const };
    updateSignalInDb(updated);
    setSignals(prev => prev.map(s => s.id === signal.id ? updated : s));
    recordWin();
    setCurrentPrediction(null);
    setPredictionState('analyzing');
    setGaleLevel(0);
    waitingForResult.current = false;
    
    toast({
      title: '✅ ACERTOU!',
      description: 'Voltando a analisar...',
    });
  }, [updateSignalInDb, recordWin, toast]);

  // Handle loss - go to gale or reset
  const handleLoss = useCallback((signal: PredictionSignal, actualColor: BlazeColor) => {
    const updated = { ...signal, status: 'loss' as const, actualResult: actualColor };
    
    if (galeLevel < MAX_GALES) {
      // Go to next gale level
      const nextGale = galeLevel + 1;
      console.log(`LOSS! Going to Gale ${nextGale}`);
      
      // Create new signal for gale
      const galeSignal: PredictionSignal = {
        ...signal,
        id: crypto.randomUUID(),
        timestamp: new Date(),
        status: 'pending',
        galeLevel: nextGale,
        reason: `[GALE ${nextGale}] ${signal.reason}`,
      };
      
      updateSignalInDb(updated);
      saveSignalToDb(galeSignal);
      setSignals(prev => [...prev.map(s => s.id === signal.id ? updated : s), galeSignal]);
      setCurrentPrediction(galeSignal);
      setGaleLevel(nextGale);
      setPredictionState(nextGale === 1 ? 'gale1' : 'gale2');
      recordLoss();
      waitingForResult.current = true;
      
      toast({
        title: `🔄 GALE ${nextGale}`,
        description: `Tentativa ${nextGale}/${MAX_GALES} - Mesma cor com Martingale`,
        variant: 'destructive',
      });
    } else {
      // Max gales reached - go back to analyzing
      console.log('LOSS! Max gales reached, resetting to analyzing');
      updateSignalInDb(updated);
      setSignals(prev => prev.map(s => s.id === signal.id ? updated : s));
      recordLoss();
      setCurrentPrediction(null);
      setPredictionState('analyzing');
      setGaleLevel(0);
      waitingForResult.current = false;
      
      toast({
        title: '❌ PERDEU',
        description: 'Máximo de gales atingido. Voltando a analisar...',
        variant: 'destructive',
      });
    }
  }, [galeLevel, updateSignalInDb, saveSignalToDb, recordLoss, toast]);

  // Check result when new round arrives
  const checkResult = useCallback((lastRound: BlazeRound) => {
    if (!currentPrediction || currentPrediction.status !== 'pending') return;
    
    if (lastRound.color === currentPrediction.predictedColor) {
      handleWin(currentPrediction);
    } else if (lastRound.color === 'white') {
      // White doesn't count as loss - wait for next round
      console.log('White appeared - waiting for next round');
    } else {
      handleLoss(currentPrediction, lastRound.color);
    }
  }, [currentPrediction, handleWin, handleLoss]);

  // Generate prediction when in analyzing state
  const checkForSignal = useCallback(async (currentRounds: BlazeRound[]) => {
    // Strict guards to prevent multiple predictions
    const now = Date.now();
    const minIntervalMs = predictionInterval * 1000; // Convert seconds to ms
    
    if (predictionState !== 'analyzing') {
      console.log('Not generating - not in analyzing state:', predictionState);
      return;
    }
    
    if (waitingForResult.current) {
      console.log('Not generating - waiting for result');
      return;
    }
    
    if (isGeneratingPrediction.current) {
      console.log('Not generating - already generating');
      return;
    }
    
    if (now - lastPredictionTime.current < minIntervalMs) {
      console.log('Not generating - too soon since last prediction');
      return;
    }
    
    // Lock prediction generation
    isGeneratingPrediction.current = true;
    
    try {
      if (useAI) {
        console.log('Requesting AI prediction...');
        const aiSignal = await getAIPrediction();
        
        // AI hook already filters out signals where should_bet is false
        if (aiSignal) {
          lastPredictionTime.current = now;
          waitingForResult.current = true;
          setCurrentPrediction(aiSignal);
          setPredictionState('active');
          setGaleLevel(0);
          saveSignalToDb(aiSignal);
          setSignals(prev => [...prev.slice(-19), aiSignal]);
          
          const isHighConfidence = aiSignal.confidence >= 75;
          playAlertSound(isHighConfidence);
          
          toast({
            title: isHighConfidence ? '🔥 SINAL FORTE!' : '🎯 Novo Sinal!',
            description: `Apostar em ${aiSignal.predictedColor === 'red' ? 'VERMELHO' : 'PRETO'} - Confiança: ${aiSignal.confidence}%`,
          });
        } else {
          console.log('AI decided not to bet or no signal returned');
        }
      }
    } catch (error) {
      console.error('Error generating prediction:', error);
    } finally {
      isGeneratingPrediction.current = false;
    }
  }, [predictionState, predictionInterval, toast, playAlertSound, saveSignalToDb, useAI, getAIPrediction]);

  // Update signal status based on actual results
  useEffect(() => {
    if (rounds.length > 0 && currentPrediction && waitingForResult.current) {
      const lastRound = rounds[rounds.length - 1];
      
      // Check if this is a new round after the prediction
      if (lastRound.timestamp > currentPrediction.timestamp) {
        checkResult(lastRound);
      }
    }
  }, [rounds, currentPrediction, checkResult]);

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
        newRounds.forEach(round => saveRoundToDb(round));
        if (newRounds.length > 0) {
          setLastProcessedId(newRounds[newRounds.length - 1].id);
        }
      } else {
        setRounds(prev => {
          const existingIds = new Set(prev.map(r => r.id));
          const actuallyNewRounds = newRounds.filter(r => !existingIds.has(r.id));
          
          if (actuallyNewRounds.length > 0) {
            console.log(`Found ${actuallyNewRounds.length} new rounds`);
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
      await fetchBlazeData(true);
      
      setConnectionStatus('connected');
      toast({
        title: '✅ Conectado à Blaze',
        description: 'Recebendo dados em tempo real',
      });

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
    setCurrentPrediction(null);
    setPredictionState('analyzing');
    setGaleLevel(0);
    waitingForResult.current = false;
  }, []);

  // Simulation mode for testing
  const startSimulation = useCallback(() => {
    if (isSimulating) return;
    
    setIsSimulating(true);
    setConnectionStatus('connected');
    
    const initialRounds = generateMockRounds(30);
    setRounds(initialRounds);
    
    toast({
      title: '🎮 Modo Simulação',
      description: 'Gerando dados de teste',
    });

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
    setCurrentPrediction(null);
    setPredictionState('analyzing');
    setGaleLevel(0);
    waitingForResult.current = false;
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
    consecutiveLosses,
    isRecalibrating,
    // Prediction state
    predictionState,
    currentPrediction,
    galeLevel,
    // Interval settings
    predictionInterval,
    setPredictionInterval,
  };
}
