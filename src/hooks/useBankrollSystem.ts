import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface BankrollConfig {
  initialBankroll: number;
  targetAmount: number;
  baseBet: number;
  maxGales: number;
  sessionId: string;
}

export interface MartingaleBet {
  level: number;
  amount: number;
  potentialProfit: number;
  totalInvested: number;
}

export interface BetRecord {
  id?: string;
  roundId?: string;
  predictedColor: string;
  actualColor?: string;
  galeLevel: number;
  betAmount: number;
  potentialProfit: number;
  actualProfit?: number;
  result: 'pending' | 'win' | 'loss';
  bankrollBefore: number;
  bankrollAfter?: number;
  confidence: number;
  strategy?: string;
  patternData?: Record<string, unknown>;
}

export interface LearningInsights {
  bestHours: number[];
  worstHours: number[];
  colorPerformance: Record<string, { wins: number; total: number; rate: number }>;
  galeSuccess: Record<number, { wins: number; total: number; rate: number }>;
  averageConfidenceOnWin: number;
  averageConfidenceOnLoss: number;
  streakAnalysis: {
    maxWinStreak: number;
    maxLossStreak: number;
    currentStreak: number;
    isWinning: boolean;
  };
}

export interface SessionStats {
  totalBets: number;
  wins: number;
  losses: number;
  winRate: number;
  totalProfit: number;
  currentBankroll: number;
  progressToTarget: number;
  estimatedBetsToTarget: number;
}

const STORAGE_KEY = 'blaze-bankroll-system';

export function useBankrollSystem() {
  const { toast } = useToast();
  const [config, setConfig] = useState<BankrollConfig | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  
  const [currentBankroll, setCurrentBankroll] = useState<number>(config?.initialBankroll || 0);
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    totalBets: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    totalProfit: 0,
    currentBankroll: config?.initialBankroll || 0,
    progressToTarget: 0,
    estimatedBetsToTarget: 0,
  });
  
  const [learningInsights, setLearningInsights] = useState<LearningInsights>({
    bestHours: [],
    worstHours: [],
    colorPerformance: {},
    galeSuccess: {},
    averageConfidenceOnWin: 0,
    averageConfidenceOnLoss: 0,
    streakAnalysis: {
      maxWinStreak: 0,
      maxLossStreak: 0,
      currentStreak: 0,
      isWinning: true,
    },
  });
  
  const [betHistory, setBetHistory] = useState<BetRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const pendingBetRef = useRef<BetRecord | null>(null);

  // Save config to localStorage
  useEffect(() => {
    if (config) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  }, [config]);

  // Generate session ID
  const generateSessionId = useCallback((): string => {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Calculate Martingale progression
  const calculateMartingale = useCallback((baseBet: number, maxGales: number): MartingaleBet[] => {
    const progression: MartingaleBet[] = [];
    let totalInvested = 0;
    
    for (let level = 0; level <= maxGales; level++) {
      const amount = baseBet * Math.pow(2, level);
      totalInvested += amount;
      // Profit at 2x payout (red/black)
      const potentialProfit = (amount * 2) - totalInvested;
      
      progression.push({
        level,
        amount,
        potentialProfit,
        totalInvested,
      });
    }
    
    return progression;
  }, []);

  // Calculate optimal base bet to reach target safely
  const calculateOptimalBaseBet = useCallback((
    bankroll: number,
    target: number,
    maxGales: number = 2,
    desiredWinRate: number = 0.5
  ): number => {
    const profitNeeded = target - bankroll;
    
    // Calculate total cycle cost
    let cycleCost = 0;
    for (let i = 0; i <= maxGales; i++) {
      cycleCost += Math.pow(2, i);
    }
    
    // Estimate wins needed
    // Each successful cycle profits 1x base bet
    const estimatedCycles = Math.ceil(profitNeeded);
    
    // Safe base bet should allow for multiple losing cycles
    // Reserve enough for at least 5 full losing cycles
    const safetyMultiplier = 5;
    const maxBaseBet = bankroll / (cycleCost * safetyMultiplier);
    
    // Recommended bet based on target speed
    const recommendedBet = profitNeeded / (estimatedCycles * desiredWinRate * 10);
    
    // Return the safer of the two
    return Math.max(1, Math.min(maxBaseBet, recommendedBet));
  }, []);

  // Initialize a new session
  const initializeSession = useCallback(async (
    initialBankroll: number,
    targetAmount: number,
    baseBet: number,
    maxGales: number = 2
  ) => {
    const sessionId = generateSessionId();
    
    const newConfig: BankrollConfig = {
      initialBankroll,
      targetAmount,
      baseBet,
      maxGales,
      sessionId,
    };
    
    // Save to database
    try {
      const { error } = await supabase
        .from('bankroll_sessions')
        .insert({
          session_id: sessionId,
          initial_bankroll: initialBankroll,
          target_amount: targetAmount,
          current_bankroll: initialBankroll,
          base_bet: baseBet,
          max_gales: maxGales,
        });
      
      if (error) {
        console.error('Error saving session:', error);
      }
    } catch (e) {
      console.error('Error initializing session:', e);
    }
    
    setConfig(newConfig);
    setCurrentBankroll(initialBankroll);
    setSessionStats({
      totalBets: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalProfit: 0,
      currentBankroll: initialBankroll,
      progressToTarget: 0,
      estimatedBetsToTarget: Math.ceil((targetAmount - initialBankroll) / baseBet),
    });
    
    toast({
      title: "Sessão Iniciada",
      description: `Meta: R$ ${targetAmount.toFixed(2)} | Base: R$ ${baseBet.toFixed(2)}`,
    });
    
    return newConfig;
  }, [generateSessionId, toast]);

  // Record a new bet
  const recordBet = useCallback(async (bet: Omit<BetRecord, 'result'>) => {
    if (!config) return;
    
    const newBet: BetRecord = {
      ...bet,
      result: 'pending',
      bankrollBefore: currentBankroll,
    };
    
    pendingBetRef.current = newBet;
    
    // Save to database - note: bet_history table uses session_id column
    try {
      const { data, error } = await supabase
        .from('bet_history')
        .insert([{
          session_id: config.sessionId,
          round_id: bet.roundId,
          predicted_color: bet.predictedColor,
          gale_level: bet.galeLevel,
          bet_amount: bet.betAmount,
          potential_profit: bet.potentialProfit,
          bankroll_before: currentBankroll,
          confidence: bet.confidence,
          strategy: bet.strategy,
          pattern_data: bet.patternData || {},
        }] as any)
        .select()
        .single();
      
      if (data) {
        newBet.id = data.id;
        pendingBetRef.current = newBet;
      }
      
      if (error) {
        console.error('Error recording bet:', error);
      }
    } catch (e) {
      console.error('Error recording bet:', e);
    }
    
    setBetHistory(prev => [...prev, newBet]);
    
    return newBet;
  }, [config, currentBankroll]);

  // Resolve a bet (win or loss)
  const resolveBet = useCallback(async (
    actualColor: string,
    isWin: boolean
  ) => {
    if (!config || !pendingBetRef.current) return;
    
    const bet = pendingBetRef.current;
    const actualProfit = isWin ? bet.potentialProfit : -bet.betAmount;
    const newBankroll = currentBankroll + actualProfit;
    
    // Update database
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
      
      // Update session stats
      await supabase
        .from('bankroll_sessions')
        .update({
          current_bankroll: newBankroll,
          total_bets: sessionStats.totalBets + 1,
          wins: sessionStats.wins + (isWin ? 1 : 0),
          losses: sessionStats.losses + (isWin ? 0 : 1),
          total_profit: sessionStats.totalProfit + actualProfit,
        })
        .eq('session_id', config.sessionId);
      
      // Record analytics for learning
      const now = new Date();
      await supabase
        .from('betting_analytics')
        .insert({
          hour_of_day: now.getHours(),
          day_of_week: now.getDay(),
          color: bet.predictedColor,
          gale_level: bet.galeLevel,
          result: isWin ? 'win' : 'loss',
          confidence: bet.confidence,
          pattern_type: bet.strategy,
        });
      
    } catch (e) {
      console.error('Error resolving bet:', e);
    }
    
    // Update local state
    setCurrentBankroll(newBankroll);
    setBetHistory(prev => 
      prev.map(b => 
        b.id === bet.id 
          ? { ...b, actualColor, actualProfit, result: isWin ? 'win' : 'loss', bankrollAfter: newBankroll }
          : b
      )
    );
    
    const newWins = sessionStats.wins + (isWin ? 1 : 0);
    const newTotal = sessionStats.totalBets + 1;
    const newProfit = sessionStats.totalProfit + actualProfit;
    
    setSessionStats(prev => ({
      ...prev,
      totalBets: newTotal,
      wins: newWins,
      losses: prev.losses + (isWin ? 0 : 1),
      winRate: newTotal > 0 ? (newWins / newTotal) * 100 : 0,
      totalProfit: newProfit,
      currentBankroll: newBankroll,
      progressToTarget: ((newBankroll - config.initialBankroll) / (config.targetAmount - config.initialBankroll)) * 100,
      estimatedBetsToTarget: newProfit > 0 && newTotal > 0
        ? Math.ceil((config.targetAmount - newBankroll) / (newProfit / newTotal))
        : prev.estimatedBetsToTarget,
    }));
    
    pendingBetRef.current = null;
    
    // Check if target reached
    if (newBankroll >= config.targetAmount) {
      toast({
        title: "🎉 META ATINGIDA!",
        description: `Você alcançou R$ ${newBankroll.toFixed(2)}!`,
      });
    }
    
    return { actualProfit, newBankroll };
  }, [config, currentBankroll, sessionStats, toast]);

  // Load learning insights from database
  const loadLearningInsights = useCallback(async () => {
    if (!config) return;
    
    setIsLoading(true);
    
    try {
      // Get analytics data
      const { data: analytics } = await supabase
        .from('betting_analytics')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);
      
      if (!analytics || analytics.length === 0) {
        setIsLoading(false);
        return;
      }
      
      // Analyze by hour
      const hourStats: Record<number, { wins: number; total: number }> = {};
      const colorStats: Record<string, { wins: number; total: number }> = {};
      const galeStats: Record<number, { wins: number; total: number }> = {};
      let winConfidenceSum = 0;
      let winCount = 0;
      let lossConfidenceSum = 0;
      let lossCount = 0;
      
      analytics.forEach(a => {
        // Hour analysis
        if (!hourStats[a.hour_of_day]) {
          hourStats[a.hour_of_day] = { wins: 0, total: 0 };
        }
        hourStats[a.hour_of_day].total++;
        if (a.result === 'win') hourStats[a.hour_of_day].wins++;
        
        // Color analysis
        if (!colorStats[a.color]) {
          colorStats[a.color] = { wins: 0, total: 0 };
        }
        colorStats[a.color].total++;
        if (a.result === 'win') colorStats[a.color].wins++;
        
        // Gale analysis
        if (!galeStats[a.gale_level]) {
          galeStats[a.gale_level] = { wins: 0, total: 0 };
        }
        galeStats[a.gale_level].total++;
        if (a.result === 'win') galeStats[a.gale_level].wins++;
        
        // Confidence analysis
        if (a.result === 'win') {
          winConfidenceSum += a.confidence;
          winCount++;
        } else {
          lossConfidenceSum += a.confidence;
          lossCount++;
        }
      });
      
      // Calculate rates and find best/worst hours
      const hourRates = Object.entries(hourStats)
        .filter(([_, s]) => s.total >= 5)
        .map(([h, s]) => ({ hour: parseInt(h), rate: s.wins / s.total }))
        .sort((a, b) => b.rate - a.rate);
      
      const bestHours = hourRates.slice(0, 3).map(h => h.hour);
      const worstHours = hourRates.slice(-3).map(h => h.hour);
      
      const colorPerformance: Record<string, { wins: number; total: number; rate: number }> = {};
      Object.entries(colorStats).forEach(([color, stats]) => {
        colorPerformance[color] = {
          ...stats,
          rate: stats.total > 0 ? (stats.wins / stats.total) * 100 : 0,
        };
      });
      
      const galeSuccess: Record<number, { wins: number; total: number; rate: number }> = {};
      Object.entries(galeStats).forEach(([level, stats]) => {
        galeSuccess[parseInt(level)] = {
          ...stats,
          rate: stats.total > 0 ? (stats.wins / stats.total) * 100 : 0,
        };
      });
      
      // Calculate streaks from bet history
      const { data: betHistoryData } = await supabase
        .from('bet_history')
        .select('result')
        .eq('session_id', config.sessionId)
        .order('created_at', { ascending: false })
        .limit(100);
      
      let maxWinStreak = 0;
      let maxLossStreak = 0;
      let currentStreak = 0;
      let isWinning = true;
      
      if (betHistoryData && betHistoryData.length > 0) {
        let streak = 0;
        let lastResult = betHistoryData[0].result;
        
        betHistoryData.forEach((b, i) => {
          if (b.result === lastResult) {
            streak++;
          } else {
            if (lastResult === 'win' && streak > maxWinStreak) maxWinStreak = streak;
            if (lastResult === 'loss' && streak > maxLossStreak) maxLossStreak = streak;
            streak = 1;
            lastResult = b.result;
          }
          
          if (i === 0) {
            isWinning = b.result === 'win';
          }
        });
        
        currentStreak = streak;
        if (lastResult === 'win' && streak > maxWinStreak) maxWinStreak = streak;
        if (lastResult === 'loss' && streak > maxLossStreak) maxLossStreak = streak;
      }
      
      setLearningInsights({
        bestHours,
        worstHours,
        colorPerformance,
        galeSuccess,
        averageConfidenceOnWin: winCount > 0 ? winConfidenceSum / winCount : 0,
        averageConfidenceOnLoss: lossCount > 0 ? lossConfidenceSum / lossCount : 0,
        streakAnalysis: {
          maxWinStreak,
          maxLossStreak,
          currentStreak,
          isWinning,
        },
      });
      
    } catch (e) {
      console.error('Error loading insights:', e);
    }
    
    setIsLoading(false);
  }, [config]);

  // Get current bet amount based on gale level
  const getCurrentBetAmount = useCallback((galeLevel: number): number => {
    if (!config) return 0;
    return config.baseBet * Math.pow(2, galeLevel);
  }, [config]);

  // Check if bankroll can cover bet
  const canCoverBet = useCallback((galeLevel: number): boolean => {
    if (!config) return false;
    const betAmount = getCurrentBetAmount(galeLevel);
    return currentBankroll >= betAmount;
  }, [config, currentBankroll, getCurrentBetAmount]);

  // Get recommended action based on learning
  const getRecommendation = useCallback((): {
    shouldBet: boolean;
    reason: string;
    adjustedConfidence: number;
  } => {
    const currentHour = new Date().getHours();
    let shouldBet = true;
    let reason = "Condições normais";
    let adjustedConfidence = 0;
    
    // Check if current hour is good
    if (learningInsights.bestHours.includes(currentHour)) {
      adjustedConfidence += 10;
      reason = "Hora favorável baseada no histórico";
    } else if (learningInsights.worstHours.includes(currentHour)) {
      adjustedConfidence -= 15;
      reason = "⚠️ Hora com baixo desempenho histórico";
    }
    
    // Check streak
    if (learningInsights.streakAnalysis.currentStreak >= 3) {
      if (!learningInsights.streakAnalysis.isWinning) {
        shouldBet = false;
        reason = "⚠️ Sequência de perdas - considere pausar";
      } else {
        adjustedConfidence += 5;
        reason = "Sequência de vitórias - continue com cautela";
      }
    }
    
    // Check bankroll safety
    if (config && currentBankroll < config.baseBet * 7) {
      shouldBet = false;
      reason = "⚠️ Banca baixa - risco alto de zerar";
    }
    
    return { shouldBet, reason, adjustedConfidence };
  }, [config, currentBankroll, learningInsights]);

  // Reset session
  const resetSession = useCallback(async () => {
    if (config) {
      try {
        await supabase
          .from('bankroll_sessions')
          .update({ 
            status: 'stopped',
            completed_at: new Date().toISOString(),
          })
          .eq('session_id', config.sessionId);
      } catch (e) {
        console.error('Error closing session:', e);
      }
    }
    
    setConfig(null);
    setCurrentBankroll(0);
    setSessionStats({
      totalBets: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalProfit: 0,
      currentBankroll: 0,
      progressToTarget: 0,
      estimatedBetsToTarget: 0,
    });
    setBetHistory([]);
    localStorage.removeItem(STORAGE_KEY);
    
    toast({
      title: "Sessão Encerrada",
      description: "Dados salvos no histórico.",
    });
  }, [config, toast]);

  // Load session data on mount
  useEffect(() => {
    if (config) {
      loadLearningInsights();
    }
  }, [config?.sessionId]);

  return {
    // Configuration
    config,
    isConfigured: !!config,
    
    // State
    currentBankroll,
    sessionStats,
    learningInsights,
    betHistory,
    isLoading,
    
    // Calculations
    calculateMartingale,
    calculateOptimalBaseBet,
    getCurrentBetAmount,
    canCoverBet,
    getRecommendation,
    
    // Actions
    initializeSession,
    recordBet,
    resolveBet,
    resetSession,
    loadLearningInsights,
  };
}
