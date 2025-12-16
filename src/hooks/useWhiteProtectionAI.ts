import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { BlazeRound } from '@/types/blaze';

export interface WhiteProtectionSignal {
  id: string;
  shouldProtect: boolean;
  confidence: number;
  reason: string;
  suggestedAmount: number; // Percentage of bet
  timestamp: Date;
  roundsSinceLastWhite: number;
}

interface WhiteStats {
  totalRounds: number;
  whiteCount: number;
  whitePercentage: number;
  roundsSinceLastWhite: number;
  averageGapBetweenWhites: number;
  maxGapBetweenWhites: number;
  lastWhitePositions: number[];
}

export function useWhiteProtectionAI() {
  const [currentProtection, setCurrentProtection] = useState<WhiteProtectionSignal | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [whiteStats, setWhiteStats] = useState<WhiteStats | null>(null);
  const lastAnalyzedRound = useRef<string | null>(null);

  // Calculate white statistics from rounds
  const calculateWhiteStats = useCallback((rounds: BlazeRound[]): WhiteStats => {
    const totalRounds = rounds.length;
    const whiteRounds = rounds.filter(r => r.color === 'white');
    const whiteCount = whiteRounds.length;
    const whitePercentage = totalRounds > 0 ? (whiteCount / totalRounds) * 100 : 0;

    // Find rounds since last white
    let roundsSinceLastWhite = 0;
    for (let i = rounds.length - 1; i >= 0; i--) {
      if (rounds[i].color === 'white') break;
      roundsSinceLastWhite++;
    }

    // Calculate gaps between whites
    const whitePositions: number[] = [];
    rounds.forEach((r, idx) => {
      if (r.color === 'white') whitePositions.push(idx);
    });

    const gaps: number[] = [];
    for (let i = 1; i < whitePositions.length; i++) {
      gaps.push(whitePositions[i] - whitePositions[i - 1]);
    }

    const averageGapBetweenWhites = gaps.length > 0 
      ? gaps.reduce((a, b) => a + b, 0) / gaps.length 
      : 0;
    const maxGapBetweenWhites = gaps.length > 0 ? Math.max(...gaps) : 0;

    return {
      totalRounds,
      whiteCount,
      whitePercentage,
      roundsSinceLastWhite,
      averageGapBetweenWhites,
      maxGapBetweenWhites,
      lastWhitePositions: whitePositions.slice(-5),
    };
  }, []);

  // Analyze if white protection is recommended
  const analyzeWhiteProtection = useCallback(async (
    rounds: BlazeRound[],
    currentBetAmount: number
  ): Promise<WhiteProtectionSignal | null> => {
    if (rounds.length < 20) return null;

    const lastRound = rounds[rounds.length - 1];
    if (lastAnalyzedRound.current === lastRound.id) {
      return currentProtection;
    }

    setIsAnalyzing(true);
    lastAnalyzedRound.current = lastRound.id;

    try {
      const stats = calculateWhiteStats(rounds);
      setWhiteStats(stats);

      // Prepare data for AI analysis
      const recentColors = rounds.slice(-50).map(r => r.color);
      const recentNumbers = rounds.slice(-50).map(r => r.number);

      const { data, error } = await supabase.functions.invoke('white-protection-ai', {
        body: {
          recentColors,
          recentNumbers,
          stats: {
            roundsSinceLastWhite: stats.roundsSinceLastWhite,
            averageGap: stats.averageGapBetweenWhites,
            maxGap: stats.maxGapBetweenWhites,
            whitePercentage: stats.whitePercentage,
          },
          currentBetAmount,
        },
      });

      if (error) {
        console.error('White protection AI error:', error);
        // Fallback to rule-based analysis
        return generateRuleBasedProtection(stats, currentBetAmount);
      }

      const signal: WhiteProtectionSignal = {
        id: crypto.randomUUID(),
        shouldProtect: data.shouldProtect,
        confidence: data.confidence,
        reason: data.reason,
        suggestedAmount: data.suggestedAmount,
        timestamp: new Date(),
        roundsSinceLastWhite: stats.roundsSinceLastWhite,
      };

      setCurrentProtection(signal);
      return signal;

    } catch (error) {
      console.error('Error analyzing white protection:', error);
      const stats = calculateWhiteStats(rounds);
      return generateRuleBasedProtection(stats, currentBetAmount);
    } finally {
      setIsAnalyzing(false);
    }
  }, [calculateWhiteStats, currentProtection]);

  // Rule-based fallback when AI is unavailable
  const generateRuleBasedProtection = useCallback((
    stats: WhiteStats,
    currentBetAmount: number
  ): WhiteProtectionSignal => {
    let shouldProtect = false;
    let confidence = 0;
    let reason = '';
    let suggestedAmount = 0;

    // White appears ~7% of the time (1 in 14)
    // Average gap is around 14 rounds
    const expectedGap = 14;
    const gapRatio = stats.roundsSinceLastWhite / expectedGap;

    if (stats.roundsSinceLastWhite >= 25) {
      // Very high chance - protect strongly
      shouldProtect = true;
      confidence = Math.min(85, 60 + (stats.roundsSinceLastWhite - 25) * 2);
      reason = `${stats.roundsSinceLastWhite} rodadas sem branco - estatisticamente muito atrasado`;
      suggestedAmount = 15; // 15% of bet
    } else if (stats.roundsSinceLastWhite >= 18) {
      // High chance - recommend protection
      shouldProtect = true;
      confidence = 55 + (stats.roundsSinceLastWhite - 18);
      reason = `${stats.roundsSinceLastWhite} rodadas sem branco - acima da média (${stats.averageGapBetweenWhites.toFixed(0)})`;
      suggestedAmount = 10; // 10% of bet
    } else if (stats.roundsSinceLastWhite >= 12 && stats.averageGapBetweenWhites <= 12) {
      // Moderate chance based on pattern
      shouldProtect = true;
      confidence = 45;
      reason = `Padrão sugere branco próximo (média de gap: ${stats.averageGapBetweenWhites.toFixed(0)})`;
      suggestedAmount = 7; // 7% of bet
    } else {
      shouldProtect = false;
      confidence = 30;
      reason = `${stats.roundsSinceLastWhite} rodadas sem branco - dentro do esperado`;
      suggestedAmount = 0;
    }

    const signal: WhiteProtectionSignal = {
      id: crypto.randomUUID(),
      shouldProtect,
      confidence,
      reason,
      suggestedAmount,
      timestamp: new Date(),
      roundsSinceLastWhite: stats.roundsSinceLastWhite,
    };

    setCurrentProtection(signal);
    return signal;
  }, []);

  const resetProtection = useCallback(() => {
    setCurrentProtection(null);
    lastAnalyzedRound.current = null;
  }, []);

  return {
    currentProtection,
    whiteStats,
    isAnalyzing,
    analyzeWhiteProtection,
    resetProtection,
  };
}
