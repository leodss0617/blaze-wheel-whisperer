import { useState, useEffect, useCallback, useRef } from 'react';
import { BlazeRound, BlazeStats, PredictionSignal, ConnectionStatus, BlazeColor } from '@/types/blaze';
import { calculateStats, analyzePatternsAndPredict, generateMockRounds } from '@/lib/blazeAnalyzer';
import { useToast } from '@/hooks/use-toast';
import { useAlertSound } from '@/hooks/useAlertSound';
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
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const { playAlertSound } = useAlertSound();

  // Calculate stats when rounds change
  useEffect(() => {
    if (rounds.length > 0) {
      const newStats = calculateStats(rounds);
      setStats(newStats);
    }
  }, [rounds]);

  // Generate prediction when new round arrives
  const checkForSignal = useCallback((currentRounds: BlazeRound[]) => {
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
          
          toast({
            title: isHighConfidence ? '🔥 SINAL FORTE!' : '🎯 Novo Sinal Gerado!',
            description: `Apostar em ${prediction.predictedColor === 'red' ? 'VERMELHO' : 'PRETO'} - Confiança: ${prediction.confidence}%`,
          });
          return [...prev.slice(-19), prediction];
        }
        return prev;
      });
    }
  }, [toast, playAlertSound]);

  // Update signal status based on actual results
  useEffect(() => {
    if (rounds.length > 0 && signals.length > 0) {
      const lastRound = rounds[rounds.length - 1];
      
      setSignals(prev => prev.map(signal => {
        if (signal.status !== 'pending') return signal;
        
        // Check if this signal was for a recent round
        const signalAge = Date.now() - signal.timestamp.getTime();
        if (signalAge > 120000) {
          return { ...signal, status: 'loss' as const, actualResult: lastRound.color };
        }
        
        // Check if the prediction was correct
        if (lastRound.timestamp > signal.timestamp) {
          if (lastRound.color === signal.predictedColor) {
            return { ...signal, status: 'win' as const };
          } else if (signal.protections > 0) {
            return { ...signal, protections: signal.protections - 1 };
          } else {
            return { ...signal, status: 'loss' as const, actualResult: lastRound.color };
          }
        }
        
        return signal;
      }));
    }
  }, [rounds]);

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
  }, [connectionStatus, toast, checkForSignal]);

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
  };
}
