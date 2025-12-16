import { useState, useEffect, useCallback } from 'react';

export interface BankrollGoal {
  currentBankroll: number;
  targetAmount: number;
  targetDays: number;
  startDate: Date;
  dailyTarget: number;
  totalNeeded: number;
  progress: number;
  daysRemaining: number;
  isOnTrack: boolean;
  projectedCompletion: Date | null;
}

export interface DailyProgress {
  date: string;
  target: number;
  actual: number;
  cumulative: number;
}

const STORAGE_KEY = 'blaze-bankroll-goal';
const DAILY_PROGRESS_KEY = 'blaze-daily-progress';

export function useBankrollGoal(currentProfit: number) {
  const [goal, setGoal] = useState<BankrollGoal | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          startDate: new Date(parsed.startDate),
          projectedCompletion: parsed.projectedCompletion ? new Date(parsed.projectedCompletion) : null,
        };
      }
    } catch (e) {
      console.error('Error loading goal:', e);
    }
    return null;
  });

  const [dailyProgress, setDailyProgress] = useState<DailyProgress[]>(() => {
    try {
      const saved = localStorage.getItem(DAILY_PROGRESS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Save goal to localStorage
  useEffect(() => {
    if (goal) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(goal));
    }
  }, [goal]);

  // Save daily progress to localStorage
  useEffect(() => {
    localStorage.setItem(DAILY_PROGRESS_KEY, JSON.stringify(dailyProgress));
  }, [dailyProgress]);

  // Calculate goal metrics
  const calculateGoal = useCallback((
    currentBankroll: number,
    targetAmount: number,
    targetDays: number,
    existingStartDate?: Date
  ): BankrollGoal => {
    const startDate = existingStartDate || new Date();
    const totalNeeded = targetAmount - currentBankroll;
    const dailyTarget = totalNeeded / targetDays;

    // Calculate days elapsed and remaining
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysElapsed = Math.floor((now.getTime() - startDate.getTime()) / msPerDay);
    const daysRemaining = Math.max(0, targetDays - daysElapsed);

    // Calculate progress
    const expectedProgress = daysElapsed * dailyTarget;
    const actualProgress = currentProfit;
    const progress = totalNeeded > 0 ? (actualProgress / totalNeeded) * 100 : 0;

    // Check if on track
    const isOnTrack = actualProgress >= expectedProgress * 0.9; // 10% margin

    // Calculate projected completion
    let projectedCompletion: Date | null = null;
    if (actualProgress > 0 && daysElapsed > 0) {
      const avgDailyProfit = actualProgress / daysElapsed;
      const remainingToGoal = totalNeeded - actualProgress;
      const daysToComplete = remainingToGoal / avgDailyProfit;
      projectedCompletion = new Date(now.getTime() + daysToComplete * msPerDay);
    }

    return {
      currentBankroll,
      targetAmount,
      targetDays,
      startDate,
      dailyTarget,
      totalNeeded,
      progress: Math.min(100, Math.max(0, progress)),
      daysRemaining,
      isOnTrack,
      projectedCompletion,
    };
  }, [currentProfit]);

  // Set a new goal
  const setNewGoal = useCallback((
    currentBankroll: number,
    targetAmount: number,
    targetDays: number
  ) => {
    const newGoal = calculateGoal(currentBankroll, targetAmount, targetDays);
    setGoal(newGoal);
    
    // Reset daily progress
    setDailyProgress([{
      date: new Date().toISOString().split('T')[0],
      target: newGoal.dailyTarget,
      actual: 0,
      cumulative: 0,
    }]);

    return newGoal;
  }, [calculateGoal]);

  // Update goal with current profit
  const updateGoalProgress = useCallback(() => {
    if (!goal) return;

    const updatedGoal = calculateGoal(
      goal.currentBankroll,
      goal.targetAmount,
      goal.targetDays,
      goal.startDate
    );
    setGoal(updatedGoal);

    // Update daily progress
    const today = new Date().toISOString().split('T')[0];
    setDailyProgress(prev => {
      const existing = prev.find(p => p.date === today);
      if (existing) {
        return prev.map(p => 
          p.date === today 
            ? { ...p, actual: currentProfit, cumulative: currentProfit }
            : p
        );
      }
      return [...prev, {
        date: today,
        target: goal.dailyTarget,
        actual: currentProfit,
        cumulative: currentProfit,
      }];
    });
  }, [goal, currentProfit, calculateGoal]);

  // Update on profit change
  useEffect(() => {
    if (goal) {
      updateGoalProgress();
    }
  }, [currentProfit]);

  // Clear goal
  const clearGoal = useCallback(() => {
    setGoal(null);
    setDailyProgress([]);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(DAILY_PROGRESS_KEY);
  }, []);

  // Get today's progress
  const getTodayProgress = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    return dailyProgress.find(p => p.date === today) || null;
  }, [dailyProgress]);

  // Calculate if goal is achievable
  const isGoalAchievable = useCallback(() => {
    if (!goal || goal.daysRemaining <= 0) return false;
    const remaining = goal.totalNeeded - currentProfit;
    const requiredDaily = remaining / goal.daysRemaining;
    return requiredDaily <= goal.dailyTarget * 1.5; // 50% buffer
  }, [goal, currentProfit]);

  return {
    goal,
    dailyProgress,
    setNewGoal,
    updateGoalProgress,
    clearGoal,
    getTodayProgress,
    isGoalAchievable,
  };
}
