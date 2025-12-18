import { useState, useEffect, useCallback, useRef } from 'react';
import { BlazeRound, BlazeStats, PredictionSignal, ConnectionStatus, BlazeColor, PredictionState } from '@/types/blaze';
import { calculateStats, analyzePatternsAndPredict, generateMockRounds } from '@/lib/blazeAnalyzer';
import { useToast } from '@/hooks/use-toast';
import { useAlertSound } from '@/hooks/useAlertSound';
import { useAIPrediction, AIPrediction, AIStats } from '@/hooks/useAIPrediction';
import { supabase } from '@/integrations/supabase/client';
import { formatBrasiliaTime } from '@/components/BrasiliaClockDisplay';
import { createRoundKey } from '@/hooks/useSystemState';

const POLL_INTERVAL = 1000; // Poll every 1 second for faster updates
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
  const [predictionInterval, setPredictionIntervalState] = useState(() => {
    const saved = localStorage.getItem('blaze-prediction-interval');
    return saved ? parseInt(saved, 10) : 2; // Default 2 rounds
  });
  
  // Track the round count when the last prediction cycle completed
  const lastCompletedRoundCount = useRef<number>(0);
  
  // Minimum time between predictions (prevents spam) - reduced for faster response
  const lastPredictionTime = useRef<number>(0);
  const MIN_PREDICTION_INTERVAL_MS = 10000; // 10 seconds minimum (one round is ~30s)
  
  // State for showing rounds remaining until next prediction
  const [roundsUntilNextPrediction, setRoundsUntilNextPrediction] = useState<number>(0);
  
  // Wrapper to save to localStorage
  const setPredictionInterval = (value: number) => {
    setPredictionIntervalState(value);
    localStorage.setItem('blaze-prediction-interval', value.toString());
  };
  
  // Prediction state management
  const [predictionState, setPredictionState] = useState<PredictionState>('analyzing');
  const [currentPrediction, setCurrentPrediction] = useState<PredictionSignal | null>(null);
  const [galeLevel, setGaleLevel] = useState(0);
  
  // Bankroll tracking
  const [baseBet, setBaseBet] = useState<number>(() => {
    const saved = localStorage.getItem('blaze-base-bet');
    return saved ? parseFloat(saved) : 0;
  });
  const [totalProfit, setTotalProfit] = useState<number>(() => {
    const saved = localStorage.getItem('blaze-total-profit');
    return saved ? parseFloat(saved) : 0;
  });
  
  // Save profit to localStorage
  useEffect(() => {
    localStorage.setItem('blaze-total-profit', totalProfit.toString());
  }, [totalProfit]);
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const waitingForResult = useRef(false);
  const isGeneratingPrediction = useRef(false);
  const predictionRoundNumber = useRef<number | null>(null); // Track round when prediction was made
  
  const { toast } = useToast();
  const { playAlertSound } = useAlertSound();
  const { getAIPrediction, isLoading: isAILoading, lastPrediction: aiPrediction, aiStats, consecutiveLosses, isRecalibrating, recordWin, recordLoss } = useAIPrediction();

  // Calculate Martingale bet
  const calculateMartingaleBet = useCallback((level: number): number => {
    if (baseBet <= 0) return 0;
    return baseBet * Math.pow(2, level);
  }, [baseBet]);

  // Calculate total spent in current sequence
  const calculateTotalSpent = useCallback((currentLevel: number): number => {
    let total = 0;
    for (let i = 0; i <= currentLevel; i++) {
      total += baseBet * Math.pow(2, i);
    }
    return total;
  }, [baseBet]);

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

  // Handle win - reset to analyzing and add profit
  const handleWin = useCallback((signal: PredictionSignal, lastRoundNumber: number, actualColor: BlazeColor) => {
    console.log('WIN! Resetting to analyzing mode');
    const updated = { ...signal, status: 'win' as const, actualResult: actualColor };
    updateSignalInDb(updated);
    setSignals(prev => prev.map(s => s.id === signal.id ? updated : s));
    recordWin(actualColor);
    
    // Mark this round count for interval counting
    lastCompletedRoundCount.current = rounds.length;
    console.log('Ciclo de previsão concluído na rodada:', lastRoundNumber, 'count:', rounds.length);
    
    // Calculate profit: win amount (2x current bet) minus total spent
    if (baseBet > 0) {
      const currentBetAmount = calculateMartingaleBet(galeLevel);
      const totalSpent = calculateTotalSpent(galeLevel);
      const winAmount = currentBetAmount * 2; // Blaze pays 2x
      const profit = winAmount - totalSpent;
      setTotalProfit(prev => prev + profit);
      console.log(`Profit: +R$ ${profit.toFixed(2)} (Won: R$ ${winAmount.toFixed(2)}, Spent: R$ ${totalSpent.toFixed(2)})`);
      
      toast({
        title: '✅ ACERTOU!',
        description: `Lucro: +R$ ${profit.toFixed(2)}`,
      });
    } else {
      toast({
        title: '✅ ACERTOU!',
        description: 'Voltando a analisar...',
      });
    }
    
    setCurrentPrediction(null);
    setPredictionState('analyzing');
    setGaleLevel(0);
    waitingForResult.current = false;
  }, [updateSignalInDb, recordWin, toast, baseBet, galeLevel, calculateMartingaleBet, calculateTotalSpent, rounds.length]);

  // Handle loss - go to gale or reset
  const handleLoss = useCallback((signal: PredictionSignal, actualColor: BlazeColor, lastRoundNumber: number) => {
    const updated = { ...signal, status: 'loss' as const, actualResult: actualColor };
    
    if (galeLevel < MAX_GALES) {
      // Go to next gale level - NOT a complete loss yet
      const nextGale = galeLevel + 1;
      console.log(`LOSS no Gale ${galeLevel}! Indo para Gale ${nextGale} - Previsão ainda NÃO concluída`);
      
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
      // Don't record loss yet - only when all gales are exhausted
      waitingForResult.current = true;
      
      toast({
        title: `🔄 GALE ${nextGale}`,
        description: `Tentativa ${nextGale}/${MAX_GALES} - Mesma cor com Martingale`,
        variant: 'destructive',
      });
    } else {
      // Max gales reached - NOW the prediction is officially LOST
      console.log('LOSS! Máximo de gales atingido - Previsão CONCLUÍDA como ERRADA');
      updateSignalInDb(updated);
      setSignals(prev => prev.map(s => s.id === signal.id ? updated : s));
      recordLoss(actualColor);
      
      // Mark this round count for interval counting
      lastCompletedRoundCount.current = rounds.length;
      console.log('Ciclo de previsão concluído (LOSS) na rodada:', lastRoundNumber, 'count:', rounds.length);
      
      // Calculate total loss (all bets in the sequence)
      if (baseBet > 0) {
        const totalLoss = calculateTotalSpent(galeLevel);
        setTotalProfit(prev => prev - totalLoss);
        console.log(`Loss: -R$ ${totalLoss.toFixed(2)}`);
        
        toast({
          title: '❌ PERDEU',
          description: `Prejuízo: -R$ ${totalLoss.toFixed(2)}`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: '❌ PERDEU',
          description: 'Máximo de gales atingido. Voltando a analisar...',
          variant: 'destructive',
        });
      }
      
      setCurrentPrediction(null);
      setPredictionState('analyzing');
      setGaleLevel(0);
      waitingForResult.current = false;
    }
  }, [galeLevel, updateSignalInDb, saveSignalToDb, recordLoss, toast, baseBet, calculateTotalSpent, rounds.length]);

  // Check result when new round arrives
  // Uses unique round key to ensure consecutive identical numbers are treated separately
  const checkResult = useCallback((lastRound: BlazeRound) => {
    if (!currentPrediction || currentPrediction.status !== 'pending') return;
    
    // Generate unique key for this round to prevent duplicate processing
    const roundKey = createRoundKey(lastRound);
    console.log(`🔍 Verificando rodada única [${roundKey}]: Previu ${currentPrediction.predictedColor}, saiu ${lastRound.color} (numero ${lastRound.number})`);
    
    // Check result
    if (lastRound.color === currentPrediction.predictedColor) {
      console.log('✅ ACERTOU!');
      handleWin(currentPrediction, lastRound.number, lastRound.color);
    } else if (lastRound.color === 'white') {
      // White is a valid round - count it but don't trigger loss
      console.log('⚪ Branco detectado como rodada válida - aguardando próxima cor');
      // Toast to inform user
      toast({
        title: '⚪ BRANCO',
        description: 'Rodada contada. Previsão segue ativa para próxima cor.',
      });
    } else {
      // Wrong color - trigger gale or loss
      console.log(`❌ ERROU! Previu ${currentPrediction.predictedColor}, saiu ${lastRound.color}. Gale level: ${galeLevel}`);
      handleLoss(currentPrediction, lastRound.color, lastRound.number);
    }
  }, [currentPrediction, galeLevel, handleWin, handleLoss, toast]);

  // Generate prediction when in analyzing state - based on round count
  const checkForSignal = useCallback(async (currentRounds: BlazeRound[]) => {
    if (currentRounds.length < 10) return; // Need at least 10 rounds for better analysis
    
    const lastRound = currentRounds[currentRounds.length - 1];
    const currentRoundNumber = lastRound.number;
    const now = Date.now();
    
    // Calculate rounds until next prediction based on total round count (not roll numbers)
    const currentRoundCount = currentRounds.length;
    const isFirstPrediction = lastCompletedRoundCount.current === 0;
    const roundsPassed = currentRoundCount - lastCompletedRoundCount.current;
    const roundsRemaining = Math.max(0, predictionInterval - roundsPassed);
    setRoundsUntilNextPrediction(roundsRemaining);
    
    // Guards - be more strict to prevent spam
    if (predictionState !== 'analyzing') {
      console.log('⏸️ Não analisando - estado:', predictionState);
      return;
    }
    if (waitingForResult.current) {
      console.log('⏸️ Aguardando resultado');
      return;
    }
    if (isGeneratingPrediction.current) {
      console.log('⏸️ Já gerando previsão');
      return;
    }
    
    // Round interval check
    if (!isFirstPrediction && roundsRemaining > 0) {
      console.log(`⏸️ Aguardando ${roundsRemaining} rodadas para próxima previsão`);
      return;
    }
    
    // Time-based guard (minimum 30 seconds between predictions)
    const timeSinceLastPrediction = now - lastPredictionTime.current;
    if (lastPredictionTime.current > 0 && timeSinceLastPrediction < MIN_PREDICTION_INTERVAL_MS) {
      const secondsRemaining = Math.ceil((MIN_PREDICTION_INTERVAL_MS - timeSinceLastPrediction) / 1000);
      console.log(`⏸️ Aguardando ${secondsRemaining}s (intervalo mínimo)`);
      return;
    }
    
    // Lock and generate
    isGeneratingPrediction.current = true;
    lastPredictionTime.current = now;
    console.log('🎯 Gerando previsão para próxima rodada...');
    
    try {
      if (useAI) {
        const aiSignal = await getAIPrediction();
        
        if (aiSignal) {
          // Store current round number - prediction is for NEXT round
          predictionRoundNumber.current = currentRoundNumber;
          
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
            description: `Apostar em ${aiSignal.predictedColor === 'red' ? 'VERMELHO' : 'PRETO'} - ${aiSignal.confidence}%`,
          });
          
          console.log(`Previsão feita na rodada ${currentRoundNumber}, aguardando próxima rodada...`);
        } else {
          // AI didn't return a signal - don't spam
          console.log('⏸️ IA não retornou sinal - aguardando melhor oportunidade');
        }
      }
    } catch (error) {
      console.error('Erro ao gerar previsão:', error);
      // Reset time on error to allow retry
      lastPredictionTime.current = now - MIN_PREDICTION_INTERVAL_MS + 10000; // Allow retry in 10s
    } finally {
      isGeneratingPrediction.current = false;
    }
  }, [predictionState, predictionInterval, toast, playAlertSound, saveSignalToDb, useAI, getAIPrediction]);

  // Update signal status based on actual results
  useEffect(() => {
    if (rounds.length > 0 && currentPrediction && waitingForResult.current) {
      const lastRound = rounds[rounds.length - 1];
      
      // Check if this is a NEW round after the prediction was made
      const isNewRound = predictionRoundNumber.current !== null && 
                         lastRound.number !== predictionRoundNumber.current;
      
      if (isNewRound) {
        console.log(`Nova rodada ${lastRound.number} detectada (previsão feita na ${predictionRoundNumber.current})`);
        checkResult(lastRound);
        // Update the tracking number for potential gales
        predictionRoundNumber.current = lastRound.number;
      }
    }
  }, [rounds, currentPrediction, checkResult]);

  // Create a truly unique identifier for each round
  // This ensures that even consecutive rounds with same number/color are unique
  const createUniqueRoundId = (game: BlazeAPIGame): string => {
    // Composite key: blaze_id + roll_number + timestamp
    // This guarantees uniqueness even if Blaze returns duplicate IDs somehow
    const timestamp = new Date(game.created_at).getTime();
    return `${game.id}_${game.roll}_${timestamp}`;
  };

  const convertBlazeGame = (game: BlazeAPIGame): BlazeRound => {
    const colorMap: Record<number, BlazeColor> = {
      0: 'white',  // White is a valid round outcome
      1: 'red',
      2: 'black',
    };
    
    const round: BlazeRound = {
      id: game.id, // Keep original Blaze ID for DB upsert
      color: colorMap[game.color] ?? 'red',
      number: game.roll,
      timestamp: new Date(game.created_at),
    };
    
    // Log white rounds specifically for debugging
    if (game.color === 0) {
      console.log(`⚪ BRANCO detectado! Roll: ${game.roll}, ID: ${game.id}, Time: ${game.created_at}`);
    }
    
    return round;
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
          // Trigger first prediction after initial load
          setTimeout(() => checkForSignal(newRounds), 500);
        }
      } else {
        setRounds(prev => {
          // Use composite key for more reliable deduplication
          const existingKeys = new Set(prev.map(r => createRoundKey(r)));
          const actuallyNewRounds = newRounds.filter(r => !existingKeys.has(createRoundKey(r)));
          
          if (actuallyNewRounds.length > 0) {
            console.log(`📍 ${actuallyNewRounds.length} rodadas NOVAS detectadas:`);
            actuallyNewRounds.forEach(round => {
              const colorEmoji = round.color === 'white' ? '⚪' : round.color === 'red' ? '🔴' : '⚫';
              console.log(`   ${colorEmoji} ${round.color.toUpperCase()} ${round.number} [${createRoundKey(round)}]`);
              saveRoundToDb(round);
            });
            
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
    roundsUntilNextPrediction,
    // Bankroll tracking
    baseBet,
    setBaseBet,
    totalProfit,
    setTotalProfit,
    resetProfit: () => {
      setTotalProfit(0);
      localStorage.removeItem('blaze-total-profit');
    },
  };
}
