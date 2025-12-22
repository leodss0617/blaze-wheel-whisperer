import { useState, useCallback, useRef, useEffect } from 'react';
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
  historicalAccuracy?: number;
}

interface WhiteStats {
  totalRounds: number;
  whiteCount: number;
  whitePercentage: number;
  roundsSinceLastWhite: number;
  averageGapBetweenWhites: number;
  maxGapBetweenWhites: number;
  minGapBetweenWhites: number;
  lastWhitePositions: number[];
  gapHistory: number[];
  stdDeviation: number;
}

interface HistoricalData {
  totalDbRounds: number;
  totalDbWhites: number;
  dbWhitePercentage: number;
  avgGapFromDb: number;
  maxGapFromDb: number;
  minGapFromDb: number;
  stdDevFromDb: number;
  gapHistory: number[];
  avgNumberBeforeWhite: number;
  recentWhitePattern: string[];
  sequencesBeforeWhite: Array<{colors: string[], numbers: number[]}>;
}

export function useWhiteProtectionAI() {
  const [currentProtection, setCurrentProtection] = useState<WhiteProtectionSignal | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [whiteStats, setWhiteStats] = useState<WhiteStats | null>(null);
  const [historicalData, setHistoricalData] = useState<HistoricalData | null>(null);
  const lastAnalyzedRound = useRef<string | null>(null);
  const lastHistoryFetch = useRef<number>(0);

  // Load complete historical data from database (1000 rounds)
  const loadHistoricalData = useCallback(async () => {
    const now = Date.now();
    // Only fetch every 30 seconds to avoid too many queries
    if (now - lastHistoryFetch.current < 30000 && historicalData) {
      return historicalData;
    }
    
    try {
      console.log('📊 Carregando histórico completo de 1000 rodadas para análise de branco...');
      
      // Get total counts
      const { count: totalCount } = await supabase
        .from('blaze_rounds')
        .select('id', { count: 'exact', head: true });

      const { count: whiteCount } = await supabase
        .from('blaze_rounds')
        .select('id', { count: 'exact', head: true })
        .eq('color', 'white');

      // Get last 1000 rounds for complete pattern analysis
      const { data: recentRounds } = await supabase
        .from('blaze_rounds')
        .select('color, number, round_timestamp')
        .order('round_timestamp', { ascending: false })
        .limit(1000);

      if (!recentRounds || recentRounds.length === 0) {
        return null;
      }

      console.log(`📊 Analisando ${recentRounds.length} rodadas para padrões de branco...`);

      // Calculate ALL gaps between whites in the 1000 rounds
      const gaps: number[] = [];
      let lastWhiteIndex = -1;
      const whitePositions: number[] = [];
      
      recentRounds.forEach((round, idx) => {
        if (round.color === 'white') {
          whitePositions.push(idx);
          if (lastWhiteIndex !== -1) {
            gaps.push(idx - lastWhiteIndex);
          }
          lastWhiteIndex = idx;
        }
      });

      const avgGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 14;
      const maxGap = gaps.length > 0 ? Math.max(...gaps) : 30;
      const minGap = gaps.length > 0 ? Math.min(...gaps) : 1;
      
      // Calculate standard deviation
      const variance = gaps.length > 0
        ? gaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) / gaps.length
        : 0;
      const stdDev = Math.sqrt(variance);

      console.log(`📊 Estatísticas de branco: ${whitePositions.length} brancos em ${recentRounds.length} rodadas`);
      console.log(`📊 Gaps: média=${avgGap.toFixed(1)}, max=${maxGap}, min=${minGap}, desvio=${stdDev.toFixed(1)}`);

      // Analyze patterns before EVERY white occurrence (last 20 whites)
      const recentPattern: string[] = [];
      const sequencesBeforeWhite: Array<{colors: string[], numbers: number[]}> = [];
      
      for (let i = 0; i < Math.min(whitePositions.length, 20); i++) {
        const whiteIdx = whitePositions[i];
        if (whiteIdx >= 5) {
          // Get 5 rounds before this white
          const before = recentRounds.slice(whiteIdx - 5, whiteIdx);
          const colorPattern = before.map(r => r.color).join('-');
          const numberPattern = before.map(r => r.number);
          recentPattern.push(colorPattern);
          sequencesBeforeWhite.push({ colors: before.map(r => r.color), numbers: numberPattern });
        }
      }

      // Find common patterns that appear before white
      const patternFrequency: Record<string, number> = {};
      recentPattern.forEach(pattern => {
        patternFrequency[pattern] = (patternFrequency[pattern] || 0) + 1;
      });

      // Sort by frequency
      const sortedPatterns = Object.entries(patternFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([pattern, count]) => `${pattern} (${count}x)`);

      console.log(`📊 Padrões mais comuns antes de branco:`, sortedPatterns);

      // Analyze number patterns before white
      const numberPatterns = sequencesBeforeWhite.flatMap(s => s.numbers);
      const avgNumberBeforeWhite = numberPatterns.length > 0 
        ? numberPatterns.reduce((a, b) => a + b, 0) / numberPatterns.length 
        : 7;

      const data: HistoricalData = {
        totalDbRounds: totalCount || 0,
        totalDbWhites: whiteCount || 0,
        dbWhitePercentage: totalCount && whiteCount ? (whiteCount / totalCount) * 100 : 6.5,
        avgGapFromDb: avgGap,
        maxGapFromDb: maxGap,
        recentWhitePattern: sortedPatterns,
        // Extended data
        minGapFromDb: minGap,
        stdDevFromDb: stdDev,
        gapHistory: gaps.slice(0, 30),
        avgNumberBeforeWhite,
        sequencesBeforeWhite: sequencesBeforeWhite.slice(0, 10),
      };

      setHistoricalData(data);
      lastHistoryFetch.current = now;
      
      return data;
    } catch (error) {
      console.error('Error loading historical data:', error);
      return null;
    }
  }, [historicalData]);

  // Calculate white statistics from current rounds
  const calculateWhiteStats = useCallback((rounds: BlazeRound[]): WhiteStats => {
    const totalRounds = rounds.length;
    const whiteRounds = rounds.filter(r => r.color === 'white');
    const whiteCount = whiteRounds.length;
    const whitePercentage = totalRounds > 0 ? (whiteCount / totalRounds) * 100 : 0;

    // Find rounds since last white (from most recent)
    let roundsSinceLastWhite = 0;
    for (let i = 0; i < rounds.length; i++) {
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
      : 14;
    const maxGapBetweenWhites = gaps.length > 0 ? Math.max(...gaps) : 30;
    const minGapBetweenWhites = gaps.length > 0 ? Math.min(...gaps) : 1;

    // Calculate standard deviation
    const variance = gaps.length > 0
      ? gaps.reduce((sum, gap) => sum + Math.pow(gap - averageGapBetweenWhites, 2), 0) / gaps.length
      : 0;
    const stdDeviation = Math.sqrt(variance);

    return {
      totalRounds,
      whiteCount,
      whitePercentage,
      roundsSinceLastWhite,
      averageGapBetweenWhites,
      maxGapBetweenWhites,
      minGapBetweenWhites,
      lastWhitePositions: whitePositions.slice(0, 10),
      gapHistory: gaps.slice(0, 20),
      stdDeviation,
    };
  }, []);

  // Analyze if white protection is recommended
  const analyzeWhiteProtection = useCallback(async (
    rounds: BlazeRound[],
    currentBetAmount: number
  ): Promise<WhiteProtectionSignal | null> => {
    if (rounds.length < 20) return null;

    const lastRound = rounds[0];
    if (lastAnalyzedRound.current === lastRound.id) {
      return currentProtection;
    }

    setIsAnalyzing(true);
    lastAnalyzedRound.current = lastRound.id;

    try {
      // Load historical data from database
      const histData = await loadHistoricalData();
      const stats = calculateWhiteStats(rounds);
      setWhiteStats(stats);

      // Prepare data for AI analysis with historical context
      const recentColors = rounds.slice(0, 50).map(r => r.color);
      const recentNumbers = rounds.slice(0, 50).map(r => r.number);

      const { data, error } = await supabase.functions.invoke('white-protection-ai', {
        body: {
          recentColors,
          recentNumbers,
          stats: {
            roundsSinceLastWhite: stats.roundsSinceLastWhite,
            averageGap: histData?.avgGapFromDb || stats.averageGapBetweenWhites,
            maxGap: histData?.maxGapFromDb || stats.maxGapBetweenWhites,
            whitePercentage: histData?.dbWhitePercentage || stats.whitePercentage,
            stdDeviation: stats.stdDeviation,
            gapHistory: stats.gapHistory,
            totalHistoricalRounds: histData?.totalDbRounds || stats.totalRounds,
            totalHistoricalWhites: histData?.totalDbWhites || stats.whiteCount,
            recentWhitePatterns: histData?.recentWhitePattern || [],
          },
          currentBetAmount,
        },
      });

      if (error) {
        console.error('White protection AI error:', error);
        return generateEnhancedRuleBasedProtection(stats, histData, currentBetAmount, recentColors);
      }

      const signal: WhiteProtectionSignal = {
        id: crypto.randomUUID(),
        shouldProtect: data.shouldProtect,
        confidence: data.confidence,
        reason: data.reason,
        suggestedAmount: data.suggestedAmount,
        timestamp: new Date(),
        roundsSinceLastWhite: stats.roundsSinceLastWhite,
        historicalAccuracy: histData?.dbWhitePercentage,
      };

      setCurrentProtection(signal);
      return signal;

    } catch (error) {
      console.error('Error analyzing white protection:', error);
      const stats = calculateWhiteStats(rounds);
      const histData = await loadHistoricalData();
      const recentColors = rounds.slice(0, 50).map(r => r.color);
      return generateEnhancedRuleBasedProtection(stats, histData, currentBetAmount, recentColors);
    } finally {
      setIsAnalyzing(false);
    }
  }, [calculateWhiteStats, currentProtection, loadHistoricalData]);

  // Enhanced rule-based fallback with historical data and pattern matching
  const generateEnhancedRuleBasedProtection = useCallback((
    stats: WhiteStats,
    histData: HistoricalData | null,
    currentBetAmount: number,
    recentColors?: string[]
  ): WhiteProtectionSignal => {
    let shouldProtect = false;
    let confidence = 0;
    let reason = '';
    let suggestedAmount = 0;
    let patternMatch = false;
    let matchedPattern = '';

    // Use historical average gap if available
    const avgGap = histData?.avgGapFromDb || stats.averageGapBetweenWhites || 14;
    const maxHistoricalGap = histData?.maxGapFromDb || stats.maxGapBetweenWhites || 40;
    const minHistoricalGap = histData?.minGapFromDb || 1;
    const whitePercentage = histData?.dbWhitePercentage || 6.5;
    const stdDev = histData?.stdDevFromDb || stats.stdDeviation || 5;
    
    // Calculate z-score (how many standard deviations from mean)
    const zScore = stdDev > 0 
      ? (stats.roundsSinceLastWhite - avgGap) / stdDev
      : (stats.roundsSinceLastWhite - avgGap) / 5;

    // More sophisticated analysis
    const gapRatio = stats.roundsSinceLastWhite / avgGap;
    const percentilePosition = stats.roundsSinceLastWhite / maxHistoricalGap;

    // Check recent gap patterns for acceleration
    const gapHistory = histData?.gapHistory || stats.gapHistory || [];
    const recentGaps = gapHistory.slice(0, 5);
    const isGapDecreasing = recentGaps.length >= 3 && 
      recentGaps[0] < recentGaps[1] && recentGaps[1] < recentGaps[2];

    // CRITICAL: Check if current pattern matches patterns that led to white
    if (recentColors && recentColors.length >= 5 && histData?.sequencesBeforeWhite) {
      const currentPattern = recentColors.slice(0, 5).join('-');
      
      for (const seq of histData.sequencesBeforeWhite) {
        const histPattern = seq.colors.join('-');
        // Check for exact match or high similarity
        if (currentPattern === histPattern) {
          patternMatch = true;
          matchedPattern = histPattern;
          console.log(`🎯 Padrão EXATO encontrado antes de branco: ${currentPattern}`);
          break;
        }
        
        // Check for partial match (3 or more colors match in sequence)
        let matchCount = 0;
        for (let i = 0; i < Math.min(5, seq.colors.length, recentColors.length); i++) {
          if (recentColors[i] === seq.colors[i]) matchCount++;
        }
        if (matchCount >= 4) {
          patternMatch = true;
          matchedPattern = histPattern;
          console.log(`🎯 Padrão SIMILAR (${matchCount}/5) encontrado: ${currentPattern} ~ ${histPattern}`);
          break;
        }
      }
    }

    // PATTERN MATCH takes priority - if current pattern matches one that led to white
    if (patternMatch && stats.roundsSinceLastWhite >= 8) {
      shouldProtect = true;
      confidence = Math.min(88, 70 + Math.floor(zScore * 3));
      reason = `🎯 PADRÃO IDENTIFICADO: Sequência ${matchedPattern} precedeu branco em histórico. Gap atual: ${stats.roundsSinceLastWhite} rodadas`;
      suggestedAmount = 15;
    }
    // ZONA CRÍTICA: > 2 desvios padrão acima da média
    else if (zScore >= 2.5 || stats.roundsSinceLastWhite >= 30) {
      shouldProtect = true;
      confidence = Math.min(92, 75 + Math.floor(zScore * 5));
      reason = `⚠️ ZONA CRÍTICA: ${stats.roundsSinceLastWhite} rodadas sem branco (z-score: ${zScore.toFixed(1)}, análise de ${histData?.totalDbRounds || 0} rodadas)`;
      suggestedAmount = 18;
    }
    // ZONA DE ALERTA ALTO: 1.5-2.5 desvios padrão
    else if (zScore >= 1.5 || stats.roundsSinceLastWhite >= 22) {
      shouldProtect = true;
      confidence = Math.min(80, 60 + Math.floor(zScore * 8));
      reason = `⚠️ ALERTA ALTO: ${stats.roundsSinceLastWhite} rodadas (média: ${avgGap.toFixed(0)}, máx histórico: ${maxHistoricalGap})`;
      suggestedAmount = 12;
    }
    // ZONA DE ALERTA: 1-1.5 desvios padrão
    else if (zScore >= 1 || stats.roundsSinceLastWhite >= 18) {
      shouldProtect = true;
      confidence = 55 + Math.floor(zScore * 5);
      reason = `⚠️ Atenção: ${stats.roundsSinceLastWhite} rodadas acima da média (${avgGap.toFixed(0)})`;
      suggestedAmount = 8;
    }
    // ZONA DE ATENÇÃO: Próximo da média com padrão acelerado
    else if (stats.roundsSinceLastWhite >= 12 && isGapDecreasing) {
      shouldProtect = true;
      confidence = 48;
      reason = `Padrão de gaps diminuindo - possível branco próximo`;
      suggestedAmount = 5;
    }
    // SEGURO
    else {
      shouldProtect = false;
      confidence = 25 + Math.floor(gapRatio * 10);
      reason = `${stats.roundsSinceLastWhite} rodadas sem branco - dentro do padrão (${(whitePercentage).toFixed(1)}% em ${histData?.totalDbRounds || stats.totalRounds} rodadas analisadas)`;
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
      historicalAccuracy: whitePercentage,
    };

    setCurrentProtection(signal);
    return signal;
  }, []);

  // Load historical data on mount
  useEffect(() => {
    loadHistoricalData();
  }, [loadHistoricalData]);

  const resetProtection = useCallback(() => {
    setCurrentProtection(null);
    lastAnalyzedRound.current = null;
  }, []);

  return {
    currentProtection,
    whiteStats,
    historicalData,
    isAnalyzing,
    analyzeWhiteProtection,
    resetProtection,
  };
}
