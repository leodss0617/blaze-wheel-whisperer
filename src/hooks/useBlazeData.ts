import { useState, useEffect, useCallback, useRef } from 'react';
import { BlazeRound, BlazeStats, PredictionSignal, ConnectionStatus, BlazeColor } from '@/types/blaze';
import { calculateStats, analyzePatternsAndPredict, generateMockRounds } from '@/lib/blazeAnalyzer';
import { useToast } from '@/hooks/use-toast';

const BLAZE_WS_URL = 'wss://api-v2.blaze.com/replication/?EIO=3&transport=websocket';

export function useBlazeData() {
  const [rounds, setRounds] = useState<BlazeRound[]>([]);
  const [stats, setStats] = useState<BlazeStats | null>(null);
  const [signals, setSignals] = useState<PredictionSignal[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [isSimulating, setIsSimulating] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

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
      const lastSignal = signals[signals.length - 1];
      const timeSinceLastSignal = lastSignal 
        ? Date.now() - lastSignal.timestamp.getTime() 
        : Infinity;
      
      if (timeSinceLastSignal > 60000 || !lastSignal) {
        setSignals(prev => [...prev.slice(-19), prediction]);
        toast({
          title: '🎯 Novo Sinal Gerado!',
          description: `Apostar em ${prediction.predictedColor === 'red' ? 'VERMELHO' : 'PRETO'} - Confiança: ${prediction.confidence}%`,
        });
      }
    }
  }, [signals, toast]);

  // Update signal status based on actual results
  useEffect(() => {
    if (rounds.length > 0 && signals.length > 0) {
      const lastRound = rounds[rounds.length - 1];
      
      setSignals(prev => prev.map(signal => {
        if (signal.status !== 'pending') return signal;
        
        // Check if this signal was for a recent round
        const signalAge = Date.now() - signal.timestamp.getTime();
        if (signalAge > 120000) {
          // Signal is too old, mark as loss
          return { ...signal, status: 'loss' as const };
        }
        
        // Check if the prediction was correct
        if (lastRound.timestamp > signal.timestamp) {
          if (lastRound.color === signal.predictedColor) {
            return { ...signal, status: 'win' as const };
          } else if (signal.protections > 0) {
            return { ...signal, protections: signal.protections - 1 };
          } else {
            return { ...signal, status: 'loss' as const };
          }
        }
        
        return signal;
      }));
    }
  }, [rounds]);

  const connectToBlaze = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionStatus('connecting');

    try {
      const ws = new WebSocket(BLAZE_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');
        toast({
          title: '✅ Conectado à Blaze',
          description: 'Recebendo dados em tempo real',
        });

        // Subscribe to double game
        setTimeout(() => {
          ws.send('40/double,');
        }, 1000);
      };

      ws.onmessage = (event) => {
        try {
          const data = event.data as string;
          
          // Parse Blaze websocket format
          if (data.includes('double.tick')) {
            const jsonMatch = data.match(/\[.*\]/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed[1]?.color !== undefined) {
                const colorMap: Record<number, BlazeColor> = {
                  0: 'white',
                  1: 'red',
                  2: 'black',
                };
                
                const newRound: BlazeRound = {
                  id: parsed[1].id || crypto.randomUUID(),
                  color: colorMap[parsed[1].color] || 'red',
                  number: parsed[1].roll || 0,
                  timestamp: new Date(),
                };

                setRounds(prev => {
                  const updated = [...prev, newRound].slice(-100);
                  checkForSignal(updated);
                  return updated;
                });
              }
            }
          }
        } catch (err) {
          console.log('Parse error:', err);
        }
      };

      ws.onerror = () => {
        setConnectionStatus('error');
        toast({
          title: '❌ Erro de conexão',
          description: 'Não foi possível conectar à Blaze',
          variant: 'destructive',
        });
      };

      ws.onclose = () => {
        setConnectionStatus('disconnected');
      };
    } catch (err) {
      setConnectionStatus('error');
      console.error('Connection error:', err);
    }
  }, [toast, checkForSignal]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
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
