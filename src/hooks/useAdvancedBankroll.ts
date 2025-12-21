import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface BankrollConfig {
  sessionId: string;
  initialBankroll: number;
  currentBankroll: number;
  targetProfit: number;
  targetAmount: number;
  baseBet: number;
  maxGales: number;
  stopLoss: number; // Percentage of bankroll to stop at
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
}

export interface BetCalculation {
  suggestedBet: number;
  galeLevel: number;
  totalAtRisk: number;
  potentialProfit: number;
  riskPercentage: number;
  canAfford: boolean;
  safetyScore: number; // 0-100
  recommendation: 'bet' | 'skip' | 'stop';
  reason: string;
}

export interface SessionStats {
  totalBets: number;
  wins: number;
  losses: number;
  winRate: number;
  totalProfit: number;
  currentBankroll: number;
  progressToTarget: number;
  maxDrawdown: number;
  bestBankroll: number;
  currentDrawdown: number;
  estimatedBetsToTarget: number;
  avgBetSize: number;
  avgProfit: number;
}

export interface GaleProgression {
  level: number;
  betAmount: number;
  totalInvested: number;
  potentialProfit: number;
  riskPercentage: number;
}

const STORAGE_KEY = 'blaze-advanced-bankroll';

export function useAdvancedBankroll() {
  const { toast } = useToast();
  
  const [config, setConfig] = useState<BankrollConfig | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [stats, setStats] = useState<SessionStats>({
    totalBets: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    totalProfit: 0,
    currentBankroll: 0,
    progressToTarget: 0,
    maxDrawdown: 0,
    bestBankroll: 0,
    currentDrawdown: 0,
    estimatedBetsToTarget: 0,
    avgBetSize: 0,
    avgProfit: 0,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const pendingBetRef = useRef<{
    id?: string;
    betAmount: number;
    galeLevel: number;
    predictedColor: string;
  } | null>(null);

  // Save config
  useEffect(() => {
    if (config) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  }, [config]);

  // Load session from DB
  useEffect(() => {
    if (!config || isInitialized) return;

    const loadSession = async () => {
      setIsLoading(true);
      try {
        const { data: sessionData } = await supabase
          .from('bankroll_sessions')
          .select('*')
          .eq('session_id', config.sessionId)
          .maybeSingle();

        if (sessionData) {
          const currentBankroll = Number(sessionData.current_bankroll);
          const initial = Number(sessionData.initial_bankroll);
          const target = Number(sessionData.target_amount);
          const totalProfit = Number(sessionData.total_profit) || 0;

          setConfig(prev => prev ? { ...prev, currentBankroll } : null);
          
          // Calculate max drawdown from history
          const { data: historyData } = await supabase
            .from('bet_history')
            .select('bankroll_after, bet_amount')
            .eq('session_id', config.sessionId)
            .order('created_at', { ascending: true });

          let maxDrawdown = 0;
          let bestBankroll = initial;
          let totalBetSize = 0;

          if (historyData) {
            historyData.forEach(h => {
              const bankroll = Number(h.bankroll_after) || 0;
              if (bankroll > bestBankroll) bestBankroll = bankroll;
              const drawdown = ((bestBankroll - bankroll) / bestBankroll) * 100;
              if (drawdown > maxDrawdown) maxDrawdown = drawdown;
              totalBetSize += Number(h.bet_amount) || 0;
            });
          }

          const currentDrawdown = ((bestBankroll - currentBankroll) / bestBankroll) * 100;
          const wins = sessionData.wins || 0;
          const losses = sessionData.losses || 0;
          const totalBets = sessionData.total_bets || 0;

          setStats({
            totalBets,
            wins,
            losses,
            winRate: totalBets > 0 ? (wins / totalBets) * 100 : 0,
            totalProfit,
            currentBankroll,
            progressToTarget: target > initial ? ((currentBankroll - initial) / (target - initial)) * 100 : 0,
            maxDrawdown,
            bestBankroll,
            currentDrawdown: Math.max(0, currentDrawdown),
            estimatedBetsToTarget: totalProfit > 0 && totalBets > 0
              ? Math.ceil((target - currentBankroll) / (totalProfit / totalBets))
              : Math.ceil((target - currentBankroll) / config.baseBet),
            avgBetSize: totalBets > 0 ? totalBetSize / totalBets : config.baseBet,
            avgProfit: totalBets > 0 ? totalProfit / totalBets : 0,
          });
        } else {
          setStats(prev => ({
            ...prev,
            currentBankroll: config.initialBankroll,
            bestBankroll: config.initialBankroll,
          }));
        }

        setIsInitialized(true);
      } catch (e) {
        console.error('Error loading session:', e);
      }
      setIsLoading(false);
    };

    loadSession();
  }, [config, isInitialized]);

  // Calculate optimal base bet based on bankroll, target, and risk level
  const calculateOptimalBaseBet = useCallback((
    bankroll: number,
    targetProfit: number,
    riskLevel: 'conservative' | 'moderate' | 'aggressive',
    maxGales: number = 2
  ): number => {
    // Total cycle cost for full gale progression
    let cycleCost = 0;
    for (let i = 0; i <= maxGales; i++) {
      cycleCost += Math.pow(2, i);
    }

    // Risk multipliers based on level
    const riskMultipliers = {
      conservative: 0.02, // 2% of bankroll per cycle
      moderate: 0.05, // 5% of bankroll per cycle
      aggressive: 0.10, // 10% of bankroll per cycle
    };

    const maxRiskPerCycle = bankroll * riskMultipliers[riskLevel];
    const baseBetFromRisk = maxRiskPerCycle / cycleCost;

    // Also consider target - how many cycles needed
    const estimatedWinRate = 0.48; // Conservative estimate
    const avgCyclesToWin = 1 / estimatedWinRate;
    const estimatedCyclesToTarget = Math.ceil(targetProfit / 1); // Each win nets ~1x base bet
    const baseBetFromTarget = targetProfit / (estimatedCyclesToTarget * estimatedWinRate);

    // Return the safer option
    return Math.max(1, Math.min(baseBetFromRisk, baseBetFromTarget));
  }, []);

  // Calculate gale progression
  const calculateGaleProgression = useCallback((
    baseBet: number,
    maxGales: number,
    currentBankroll: number
  ): GaleProgression[] => {
    const progression: GaleProgression[] = [];
    let totalInvested = 0;

    for (let level = 0; level <= maxGales; level++) {
      const betAmount = baseBet * Math.pow(2, level);
      totalInvested += betAmount;
      const potentialProfit = (betAmount * 2) - totalInvested;

      progression.push({
        level,
        betAmount,
        totalInvested,
        potentialProfit,
        riskPercentage: (totalInvested / currentBankroll) * 100,
      });
    }

    return progression;
  }, []);

  // Calculate next bet with safety checks
  const calculateBet = useCallback((
    galeLevel: number,
    predictionConfidence: number
  ): BetCalculation => {
    if (!config) {
      return {
        suggestedBet: 0,
        galeLevel: 0,
        totalAtRisk: 0,
        potentialProfit: 0,
        riskPercentage: 0,
        canAfford: false,
        safetyScore: 0,
        recommendation: 'stop',
        reason: 'Sistema não configurado',
      };
    }

    const currentBankroll = stats.currentBankroll || config.currentBankroll;
    const progression = calculateGaleProgression(config.baseBet, config.maxGales, currentBankroll);
    
    // Check if we can afford this gale level
    const currentGale = progression[Math.min(galeLevel, progression.length - 1)];
    const canAfford = currentBankroll >= currentGale.totalInvested;

    // Calculate safety score (0-100)
    let safetyScore = 100;
    
    // Reduce for high risk percentage
    safetyScore -= currentGale.riskPercentage * 2;
    
    // Reduce for current drawdown
    safetyScore -= stats.currentDrawdown;
    
    // Reduce for loss streaks (check recent history)
    if (stats.losses > stats.wins && stats.totalBets >= 5) {
      safetyScore -= 20;
    }

    // Reduce for low confidence
    if (predictionConfidence < 60) {
      safetyScore -= (60 - predictionConfidence) / 2;
    }

    // Bonus for good win rate
    if (stats.winRate > 50 && stats.totalBets >= 10) {
      safetyScore += 10;
    }

    safetyScore = Math.max(0, Math.min(100, safetyScore));

    // Determine recommendation
    let recommendation: 'bet' | 'skip' | 'stop' = 'bet';
    let reason = 'Condições favoráveis para apostar';

    // Stop conditions
    if (!canAfford) {
      recommendation = 'stop';
      reason = '❌ Banca insuficiente para cobrir esta aposta';
    } else if (currentGale.riskPercentage > 50) {
      recommendation = 'stop';
      reason = '❌ Risco muito alto - mais de 50% da banca em risco';
    } else if (stats.currentDrawdown > 40) {
      recommendation = 'stop';
      reason = '❌ Drawdown alto - considere pausar e analisar';
    } else if (currentBankroll <= config.initialBankroll * (config.stopLoss / 100)) {
      recommendation = 'stop';
      reason = '❌ Stop loss atingido - pare de apostar';
    } else if (currentBankroll >= config.targetAmount) {
      recommendation = 'stop';
      reason = '🎉 Meta atingida! Considere encerrar a sessão';
    }
    // Skip conditions
    else if (galeLevel >= config.maxGales) {
      recommendation = 'skip';
      reason = '⚠️ Máximo de gales atingido - aguarde novo ciclo';
    } else if (predictionConfidence < 45) {
      recommendation = 'skip';
      reason = '⚠️ Confiança baixa - aguarde sinal mais forte';
    } else if (safetyScore < 40) {
      recommendation = 'skip';
      reason = '⚠️ Score de segurança baixo - momento arriscado';
    }
    // Bet with caution
    else if (safetyScore < 60) {
      recommendation = 'bet';
      reason = '⚠️ Aposte com cautela - condições não ideais';
    } else if (safetyScore >= 80) {
      recommendation = 'bet';
      reason = '✅ Excelente momento para apostar';
    }

    return {
      suggestedBet: currentGale.betAmount,
      galeLevel,
      totalAtRisk: currentGale.totalInvested,
      potentialProfit: currentGale.potentialProfit,
      riskPercentage: currentGale.riskPercentage,
      canAfford,
      safetyScore,
      recommendation,
      reason,
    };
  }, [config, stats, calculateGaleProgression]);

  // Initialize new session
  const initializeSession = useCallback(async (
    initialBankroll: number,
    targetProfit: number,
    riskLevel: 'conservative' | 'moderate' | 'aggressive' = 'moderate',
    maxGales: number = 2,
    stopLoss: number = 30
  ) => {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const targetAmount = initialBankroll + targetProfit;
    const baseBet = calculateOptimalBaseBet(initialBankroll, targetProfit, riskLevel, maxGales);

    const newConfig: BankrollConfig = {
      sessionId,
      initialBankroll,
      currentBankroll: initialBankroll,
      targetProfit,
      targetAmount,
      baseBet: Math.round(baseBet * 100) / 100,
      maxGales,
      stopLoss,
      riskLevel,
    };

    try {
      await supabase.from('bankroll_sessions').insert({
        session_id: sessionId,
        initial_bankroll: initialBankroll,
        target_amount: targetAmount,
        current_bankroll: initialBankroll,
        base_bet: newConfig.baseBet,
        max_gales: maxGales,
        status: 'active',
      });
    } catch (e) {
      console.error('Error saving session:', e);
    }

    setConfig(newConfig);
    setStats({
      totalBets: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalProfit: 0,
      currentBankroll: initialBankroll,
      progressToTarget: 0,
      maxDrawdown: 0,
      bestBankroll: initialBankroll,
      currentDrawdown: 0,
      estimatedBetsToTarget: Math.ceil(targetProfit / newConfig.baseBet),
      avgBetSize: newConfig.baseBet,
      avgProfit: 0,
    });
    setIsInitialized(true);

    toast({
      title: "Sessão Iniciada",
      description: `Meta: R$ ${targetAmount.toFixed(2)} | Base: R$ ${newConfig.baseBet.toFixed(2)}`,
    });

    return newConfig;
  }, [calculateOptimalBaseBet, toast]);

  // Record a bet
  const recordBet = useCallback(async (
    predictedColor: string,
    galeLevel: number,
    confidence: number,
    roundId?: string,
    strategy?: string
  ) => {
    if (!config) return;

    const betCalc = calculateBet(galeLevel, confidence);
    
    pendingBetRef.current = {
      betAmount: betCalc.suggestedBet,
      galeLevel,
      predictedColor,
    };

    try {
      const { data, error } = await supabase
        .from('bet_history')
        .insert([{
          session_id: config.sessionId,
          round_id: roundId,
          predicted_color: predictedColor,
          gale_level: galeLevel,
          bet_amount: betCalc.suggestedBet,
          potential_profit: betCalc.potentialProfit,
          bankroll_before: stats.currentBankroll,
          confidence,
          strategy,
          pattern_data: {
            safetyScore: betCalc.safetyScore,
            riskPercentage: betCalc.riskPercentage,
            recommendation: betCalc.recommendation,
          },
        }] as any)
        .select()
        .single();

      if (data) {
        pendingBetRef.current.id = data.id;
      }
      if (error) console.error('Error recording bet:', error);
    } catch (e) {
      console.error('Error recording bet:', e);
    }

    return betCalc;
  }, [config, stats, calculateBet]);

  // Resolve bet
  const resolveBet = useCallback(async (
    actualColor: string,
    isWin: boolean
  ) => {
    if (!config || !pendingBetRef.current) return;

    const bet = pendingBetRef.current;
    const progression = calculateGaleProgression(config.baseBet, config.maxGales, stats.currentBankroll);
    const currentGale = progression[Math.min(bet.galeLevel, progression.length - 1)];
    
    const actualProfit = isWin ? currentGale.potentialProfit : -currentGale.totalInvested;
    const newBankroll = stats.currentBankroll + actualProfit;
    const newBestBankroll = Math.max(stats.bestBankroll, newBankroll);
    const newMaxDrawdown = Math.max(
      stats.maxDrawdown,
      ((newBestBankroll - newBankroll) / newBestBankroll) * 100
    );

    try {
      if (bet.id) {
        await supabase
          .from('bet_history')
          .update({
            actual_color: actualColor,
            actual_profit: actualProfit,
            result: isWin ? 'win' : 'loss',
            bankroll_after: newBankroll,
          })
          .eq('id', bet.id);
      }

      await supabase
        .from('bankroll_sessions')
        .update({
          current_bankroll: newBankroll,
          total_bets: stats.totalBets + 1,
          wins: stats.wins + (isWin ? 1 : 0),
          losses: stats.losses + (isWin ? 0 : 1),
          total_profit: stats.totalProfit + actualProfit,
        })
        .eq('session_id', config.sessionId);

      // Save analytics
      const now = new Date();
      await supabase.from('betting_analytics').insert({
        hour_of_day: now.getHours(),
        day_of_week: now.getDay(),
        color: bet.predictedColor,
        gale_level: bet.galeLevel,
        result: isWin ? 'win' : 'loss',
        confidence: 0,
      });
    } catch (e) {
      console.error('Error resolving bet:', e);
    }

    setConfig(prev => prev ? { ...prev, currentBankroll: newBankroll } : null);

    const newWins = stats.wins + (isWin ? 1 : 0);
    const newLosses = stats.losses + (isWin ? 0 : 1);
    const newTotal = stats.totalBets + 1;
    const newProfit = stats.totalProfit + actualProfit;

    setStats(prev => ({
      ...prev,
      totalBets: newTotal,
      wins: newWins,
      losses: newLosses,
      winRate: newTotal > 0 ? (newWins / newTotal) * 100 : 0,
      totalProfit: newProfit,
      currentBankroll: newBankroll,
      progressToTarget: config.targetAmount > config.initialBankroll
        ? ((newBankroll - config.initialBankroll) / (config.targetAmount - config.initialBankroll)) * 100
        : 0,
      maxDrawdown: newMaxDrawdown,
      bestBankroll: newBestBankroll,
      currentDrawdown: Math.max(0, ((newBestBankroll - newBankroll) / newBestBankroll) * 100),
      estimatedBetsToTarget: newProfit > 0 && newTotal > 0
        ? Math.ceil((config.targetAmount - newBankroll) / (newProfit / newTotal))
        : prev.estimatedBetsToTarget,
      avgBetSize: newTotal > 0 ? prev.avgBetSize : config.baseBet,
      avgProfit: newTotal > 0 ? newProfit / newTotal : 0,
    }));

    pendingBetRef.current = null;

    if (newBankroll >= config.targetAmount) {
      toast({
        title: "🎉 META ATINGIDA!",
        description: `Parabéns! Você alcançou R$ ${newBankroll.toFixed(2)}!`,
      });
    } else if (newBankroll <= config.initialBankroll * (config.stopLoss / 100)) {
      toast({
        title: "⚠️ Stop Loss Atingido",
        description: "A banca atingiu o limite de perda. Considere parar.",
        variant: "destructive",
      });
    }

    return { actualProfit, newBankroll };
  }, [config, stats, calculateGaleProgression, toast]);

  // Reset session
  const resetSession = useCallback(async () => {
    if (config) {
      try {
        await supabase
          .from('bankroll_sessions')
          .update({ status: 'stopped', completed_at: new Date().toISOString() })
          .eq('session_id', config.sessionId);
      } catch (e) {
        console.error('Error closing session:', e);
      }
    }

    setConfig(null);
    setStats({
      totalBets: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalProfit: 0,
      currentBankroll: 0,
      progressToTarget: 0,
      maxDrawdown: 0,
      bestBankroll: 0,
      currentDrawdown: 0,
      estimatedBetsToTarget: 0,
      avgBetSize: 0,
      avgProfit: 0,
    });
    setIsInitialized(false);
    localStorage.removeItem(STORAGE_KEY);

    toast({
      title: "Sessão Encerrada",
      description: "Dados salvos no histórico.",
    });
  }, [config, toast]);

  return {
    config,
    isConfigured: !!config,
    stats,
    isLoading,
    calculateOptimalBaseBet,
    calculateGaleProgression,
    calculateBet,
    initializeSession,
    recordBet,
    resolveBet,
    resetSession,
  };
}
