import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PredictionSignal, PredictionState, BlazeRound } from '@/types/blaze';

interface AutoBetConfig {
  enabled: boolean;
  targetProfit: number;
  stopLoss: number;
  baseBet: number;
  maxGales: number;
}

interface AutoBetStats {
  totalBets: number;
  wins: number;
  losses: number;
  totalProfit: number;
  currentStreak: number;
  balance: number;
}

export function useAutoBet() {
  const [config, setConfig] = useState<AutoBetConfig>(() => {
    const saved = localStorage.getItem('autobet-config');
    return saved ? JSON.parse(saved) : {
      enabled: false,
      targetProfit: 100,
      stopLoss: 50,
      baseBet: 2,
      maxGales: 2,
    };
  });

  const [stats, setStats] = useState<AutoBetStats>({
    totalBets: 0,
    wins: 0,
    losses: 0,
    totalProfit: 0,
    currentStreak: 0,
    balance: 0,
  });

  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastBetResult, setLastBetResult] = useState<'win' | 'loss' | null>(null);
  const [currentGale, setCurrentGale] = useState(0);
  const [isBetting, setIsBetting] = useState(false);
  
  const { toast } = useToast();
  const betInProgress = useRef(false);
  const sessionStartBalance = useRef<number | null>(null);

  // Save config to localStorage
  useEffect(() => {
    localStorage.setItem('autobet-config', JSON.stringify(config));
  }, [config]);

  // Check balance
  const checkBalance = useCallback(async (): Promise<number | null> => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.functions.invoke('blaze-auto-bet', {
        body: { action: 'check_balance' },
      });

      if (error || !data?.success) {
        console.error('Balance check error:', error || data?.error);
        toast({
          title: '❌ Erro',
          description: data?.error || 'Não foi possível verificar o saldo',
          variant: 'destructive',
        });
        return null;
      }

      const balance = data.balance;
      setStats(prev => ({ ...prev, balance }));
      setIsConnected(true);
      
      if (sessionStartBalance.current === null) {
        sessionStartBalance.current = balance;
      }

      return balance;
    } catch (error) {
      console.error('Check balance error:', error);
      setIsConnected(false);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Calculate Martingale bet
  const calculateBet = useCallback((galeLevel: number): number => {
    return config.baseBet * Math.pow(2, galeLevel);
  }, [config.baseBet]);

  // Place bet
  const placeBet = useCallback(async (color: 'red' | 'black', galeLevel: number = 0): Promise<boolean> => {
    if (betInProgress.current) {
      console.log('Bet already in progress, skipping...');
      return false;
    }

    betInProgress.current = true;
    setIsBetting(true);
    
    const amount = calculateBet(galeLevel);
    console.log(`🎰 Placing bet: R$ ${amount} on ${color} (Gale ${galeLevel})`);
    
    try {
      const { data, error } = await supabase.functions.invoke('blaze-auto-bet', {
        body: { action: 'place_bet', color, amount },
      });

      if (error || !data?.success) {
        console.error('Bet error:', error || data?.error);
        toast({
          title: '❌ Erro na aposta',
          description: data?.error || 'Não foi possível realizar a aposta',
          variant: 'destructive',
        });
        return false;
      }

      toast({
        title: '✅ Aposta realizada!',
        description: `R$ ${amount.toFixed(2)} no ${color === 'red' ? 'VERMELHO' : 'PRETO'}`,
      });

      setStats(prev => ({ ...prev, totalBets: prev.totalBets + 1 }));
      setCurrentGale(galeLevel);
      
      return true;
    } catch (error) {
      console.error('Place bet error:', error);
      return false;
    } finally {
      betInProgress.current = false;
      setIsBetting(false);
    }
  }, [calculateBet, toast]);

  // Handle prediction signal - AUTO BET
  const handlePrediction = useCallback(async (
    signal: PredictionSignal,
    predictionState: PredictionState,
    galeLevel: number
  ) => {
    if (!config.enabled || !isConnected) {
      console.log('Auto-bet disabled or not connected');
      return;
    }

    // Check limits
    if (stats.totalProfit >= config.targetProfit) {
      toast({
        title: '🎯 Meta atingida!',
        description: `Lucro: R$ ${stats.totalProfit.toFixed(2)}`,
      });
      setConfig(prev => ({ ...prev, enabled: false }));
      return;
    }

    if (stats.totalProfit <= -config.stopLoss) {
      toast({
        title: '🛑 Stop Loss atingido!',
        description: `Prejuízo: R$ ${Math.abs(stats.totalProfit).toFixed(2)}`,
        variant: 'destructive',
      });
      setConfig(prev => ({ ...prev, enabled: false }));
      return;
    }

    // Only bet when prediction state is active or gale
    if (predictionState === 'analyzing' || !signal) return;

    const color = signal.predictedColor as 'red' | 'black';
    if (color !== 'red' && color !== 'black') return;

    await placeBet(color, galeLevel);
  }, [config, isConnected, stats.totalProfit, placeBet, toast]);

  // Record result
  const recordResult = useCallback((won: boolean, galeLevel: number) => {
    const betAmount = calculateBet(galeLevel);
    
    if (won) {
      // Calculate total spent in this sequence
      let totalSpent = 0;
      for (let i = 0; i <= galeLevel; i++) {
        totalSpent += calculateBet(i);
      }
      const profit = (betAmount * 2) - totalSpent;
      
      setStats(prev => ({
        ...prev,
        wins: prev.wins + 1,
        totalProfit: prev.totalProfit + profit,
        currentStreak: prev.currentStreak >= 0 ? prev.currentStreak + 1 : 1,
      }));
      setLastBetResult('win');
      setCurrentGale(0);
    } else {
      // Only count loss when all gales exhausted
      if (galeLevel >= config.maxGales) {
        let totalLoss = 0;
        for (let i = 0; i <= galeLevel; i++) {
          totalLoss += calculateBet(i);
        }
        
        setStats(prev => ({
          ...prev,
          losses: prev.losses + 1,
          totalProfit: prev.totalProfit - totalLoss,
          currentStreak: prev.currentStreak <= 0 ? prev.currentStreak - 1 : -1,
        }));
        setLastBetResult('loss');
        setCurrentGale(0);
      }
    }

    // Refresh balance
    checkBalance();
  }, [calculateBet, config.maxGales, checkBalance]);

  // Toggle auto-bet
  const toggleAutoBet = useCallback(async () => {
    if (!config.enabled) {
      // Starting auto-bet - check balance first
      const balance = await checkBalance();
      if (balance === null) {
        toast({
          title: '❌ Erro',
          description: 'Configure seu token da Blaze primeiro',
          variant: 'destructive',
        });
        return;
      }
      
      sessionStartBalance.current = balance;
      setStats(prev => ({ ...prev, totalProfit: 0, totalBets: 0, wins: 0, losses: 0 }));
    }
    
    setConfig(prev => ({ ...prev, enabled: !prev.enabled }));
  }, [config.enabled, checkBalance, toast]);

  // Update config
  const updateConfig = useCallback((updates: Partial<AutoBetConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  // Reset stats
  const resetStats = useCallback(() => {
    setStats({
      totalBets: 0,
      wins: 0,
      losses: 0,
      totalProfit: 0,
      currentStreak: 0,
      balance: stats.balance,
    });
    sessionStartBalance.current = stats.balance;
  }, [stats.balance]);

  return {
    config,
    stats,
    isConnected,
    isLoading,
    isBetting,
    lastBetResult,
    currentGale,
    checkBalance,
    placeBet,
    handlePrediction,
    recordResult,
    toggleAutoBet,
    updateConfig,
    resetStats,
    calculateBet,
  };
}
