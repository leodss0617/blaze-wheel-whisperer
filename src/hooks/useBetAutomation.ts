import { useState, useEffect, useCallback, useRef } from 'react';
import { useExtensionBridge } from './useExtensionBridge';
import type { PredictionSignal, PredictionState } from '@/types/blaze';

export interface AutomationConfig {
  enabled: boolean;
  baseBet: number;
  maxGales: number;
  dailyTarget: number;
  dailyLossLimit: number;
  stopOnDailyTarget: boolean;
  stopOnDailyLoss: boolean;
  autoRestart: boolean; // Restart next day
}

export interface AutomationStats {
  todayProfit: number;
  todayBets: number;
  todayWins: number;
  todayLosses: number;
  currentGale: number;
  lastBetTimestamp: number | null;
  sessionStartDate: string;
  targetReached: boolean;
  lossLimitReached: boolean;
}

const STORAGE_KEY = 'blaze-bet-automation';
const STATS_KEY = 'blaze-automation-stats';

const getToday = () => new Date().toISOString().split('T')[0];

export function useBetAutomation() {
  const { sendSignalToExtension, isConnected } = useExtensionBridge();

  const [config, setConfig] = useState<AutomationConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      enabled: false,
      baseBet: 2,
      maxGales: 2,
      dailyTarget: 50,
      dailyLossLimit: 30,
      stopOnDailyTarget: true,
      stopOnDailyLoss: true,
      autoRestart: true,
    };
  });

  const [stats, setStats] = useState<AutomationStats>(() => {
    try {
      const saved = localStorage.getItem(STATS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Reset stats if new day
        if (parsed.sessionStartDate !== getToday()) {
          return {
            todayProfit: 0,
            todayBets: 0,
            todayWins: 0,
            todayLosses: 0,
            currentGale: 0,
            lastBetTimestamp: null,
            sessionStartDate: getToday(),
            targetReached: false,
            lossLimitReached: false,
          };
        }
        return parsed;
      }
    } catch (e) {}
    return {
      todayProfit: 0,
      todayBets: 0,
      todayWins: 0,
      todayLosses: 0,
      currentGale: 0,
      lastBetTimestamp: null,
      sessionStartDate: getToday(),
      targetReached: false,
      lossLimitReached: false,
    };
  });

  const pendingBetRef = useRef<{
    color: 'red' | 'black';
    amount: number;
    galeLevel: number;
  } | null>(null);

  // Save config
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  // Save stats
  useEffect(() => {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }, [stats]);

  // Check if should stop betting
  const shouldStopBetting = useCallback(() => {
    if (!config.enabled) return true;
    
    // Check daily target
    if (config.stopOnDailyTarget && stats.todayProfit >= config.dailyTarget) {
      return true;
    }
    
    // Check daily loss limit
    if (config.stopOnDailyLoss && stats.todayProfit <= -config.dailyLossLimit) {
      return true;
    }
    
    return false;
  }, [config, stats]);

  // Calculate martingale bet
  const calculateMartingaleBet = useCallback((galeLevel: number): number => {
    return config.baseBet * Math.pow(2, galeLevel);
  }, [config.baseBet]);

  // Get total bet cycle cost (base + all gales)
  const getTotalCycleCost = useCallback((): number => {
    let total = 0;
    for (let i = 0; i <= config.maxGales; i++) {
      total += calculateMartingaleBet(i);
    }
    return total;
  }, [config.maxGales, calculateMartingaleBet]);

  // Place bet via extension
  const placeBet = useCallback((
    prediction: PredictionSignal,
    predictionState: PredictionState,
    galeLevel: number
  ): boolean => {
    if (!config.enabled || !isConnected) {
      console.log('🚫 Automation disabled or not connected');
      return false;
    }

    if (shouldStopBetting()) {
      console.log('🛑 Should stop betting - target/loss limit reached');
      return false;
    }

    if (prediction.predictedColor === 'white') {
      return false;
    }

    const actualGale = Math.min(galeLevel, config.maxGales);
    const betAmount = calculateMartingaleBet(actualGale);

    // Store pending bet
    pendingBetRef.current = {
      color: prediction.predictedColor as 'red' | 'black',
      amount: betAmount,
      galeLevel: actualGale,
    };

    // Send to extension
    const sent = sendSignalToExtension(
      prediction.predictedColor as 'red' | 'black',
      betAmount,
      prediction.confidence,
      actualGale,
      false
    );

    if (sent) {
      setStats(prev => ({
        ...prev,
        currentGale: actualGale,
        lastBetTimestamp: Date.now(),
        todayBets: prev.todayBets + 1,
      }));
    }

    return sent;
  }, [config, isConnected, shouldStopBetting, calculateMartingaleBet, sendSignalToExtension]);

  // Record bet result
  const recordResult = useCallback((won: boolean, galeLevel: number) => {
    const betAmount = calculateMartingaleBet(galeLevel);
    
    // Calculate profit/loss
    // Win: betAmount * 2 (return) - totalBetInCycle
    // Loss: -totalBetInCycle
    let totalBetInCycle = 0;
    for (let i = 0; i <= galeLevel; i++) {
      totalBetInCycle += calculateMartingaleBet(i);
    }

    const profit = won ? (betAmount * 2 - totalBetInCycle) : -totalBetInCycle;

    setStats(prev => {
      const newProfit = prev.todayProfit + profit;
      const targetReached = config.stopOnDailyTarget && newProfit >= config.dailyTarget;
      const lossLimitReached = config.stopOnDailyLoss && newProfit <= -config.dailyLossLimit;

      return {
        ...prev,
        todayProfit: newProfit,
        todayWins: won ? prev.todayWins + 1 : prev.todayWins,
        todayLosses: !won ? prev.todayLosses + 1 : prev.todayLosses,
        currentGale: won ? 0 : Math.min(galeLevel + 1, config.maxGales),
        targetReached,
        lossLimitReached,
      };
    });

    // Clear pending bet
    pendingBetRef.current = null;

    // Auto-disable if limits reached
    if (won && config.stopOnDailyTarget && stats.todayProfit + profit >= config.dailyTarget) {
      console.log('🎯 Daily target reached! Stopping automation.');
    }
    if (!won && config.stopOnDailyLoss && stats.todayProfit + profit <= -config.dailyLossLimit) {
      console.log('🛑 Daily loss limit reached! Stopping automation.');
    }
  }, [calculateMartingaleBet, config, stats.todayProfit]);

  // Update config
  const updateConfig = useCallback((updates: Partial<AutomationConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  // Toggle automation
  const toggleAutomation = useCallback(() => {
    setConfig(prev => ({ ...prev, enabled: !prev.enabled }));
  }, []);

  // Reset daily stats
  const resetDailyStats = useCallback(() => {
    setStats({
      todayProfit: 0,
      todayBets: 0,
      todayWins: 0,
      todayLosses: 0,
      currentGale: 0,
      lastBetTimestamp: null,
      sessionStartDate: getToday(),
      targetReached: false,
      lossLimitReached: false,
    });
  }, []);

  // Calculate recommended base bet from goal
  const calculateBaseBetFromGoal = useCallback((
    dailyTarget: number,
    expectedWinRate: number = 0.6, // 60% win rate assumption
    betsPerDay: number = 20
  ): number => {
    // Formula: baseBet = dailyTarget / (expectedWins * avgWinMultiplier)
    // avgWinMultiplier considers gale recovery
    const expectedWins = betsPerDay * expectedWinRate;
    const avgWinProfit = 1; // Simplified: each win cycle gives ~1x base bet profit
    
    const recommendedBet = dailyTarget / (expectedWins * avgWinProfit);
    return Math.max(1, Math.round(recommendedBet * 100) / 100);
  }, []);

  // Get current bet amount for display
  const getCurrentBetAmount = useCallback((): number => {
    return calculateMartingaleBet(stats.currentGale);
  }, [calculateMartingaleBet, stats.currentGale]);

  // Check if can afford next bet
  const canAffordNextBet = useCallback((bankroll: number): boolean => {
    const nextBet = calculateMartingaleBet(stats.currentGale);
    return bankroll >= nextBet;
  }, [calculateMartingaleBet, stats.currentGale]);

  // Get betting status message
  const getStatusMessage = useCallback((): string => {
    if (!config.enabled) return 'Automação desativada';
    if (!isConnected) return 'Extensão desconectada';
    if (stats.targetReached) return '🎯 Meta diária atingida!';
    if (stats.lossLimitReached) return '🛑 Limite de perda atingido';
    if (shouldStopBetting()) return 'Aguardando condições';
    return 'Automação ativa';
  }, [config.enabled, isConnected, stats, shouldStopBetting]);

  return {
    config,
    stats,
    updateConfig,
    toggleAutomation,
    placeBet,
    recordResult,
    resetDailyStats,
    calculateBaseBetFromGoal,
    calculateMartingaleBet,
    getCurrentBetAmount,
    getTotalCycleCost,
    canAffordNextBet,
    shouldStopBetting,
    getStatusMessage,
    isActive: config.enabled && isConnected && !shouldStopBetting(),
  };
}
