// Hybrid predictor - combines all analysis methods with intelligent weighting
// Decides when to follow vs counter based on multiple factors

import { Color, PredictionSignal, AnalysisFactors } from '@/types/prediction';
import { buildMarkovChain, predictFromMarkov } from './markovChain';
import { calculateGapStats, getHeatZoneScore } from './gapAnalysis';
import { analyzeStreaks, getStreakRecommendation } from './streakAnalysis';
import { calculateFrequency, getEqualizationScore } from './frequencyAnalysis';
import { LearnedPattern, findMatchingPatterns, getPatternScore } from './patternMatcher';

export interface PredictionInput {
  colors: Color[];
  numbers: number[];
  learnedPatterns: LearnedPattern[];
  hour: number;
  minute: number;
}

export interface PredictionOutput {
  signal: PredictionSignal | null;
  analysis: AnalysisFactors;
  debug: {
    redScore: number;
    blackScore: number;
    reasons: string[];
  };
}

export function generatePrediction(input: PredictionInput): PredictionOutput {
  const { colors, numbers, learnedPatterns, hour, minute } = input;
  
  if (colors.length < 15) {
    return {
      signal: null,
      analysis: createEmptyAnalysis(hour, minute),
      debug: { redScore: 0, blackScore: 0, reasons: ['Dados insuficientes'] }
    };
  }
  
  let redScore = 0;
  let blackScore = 0;
  const reasons: string[] = [];
  
  // 1. MARKOV CHAIN ANALYSIS (weight: high)
  const markovChain = buildMarkovChain(colors, 3);
  const markovPrediction = predictFromMarkov(colors, markovChain, 3);
  
  if (markovPrediction.color && markovPrediction.sampleSize >= 5) {
    const markovScore = Math.round((markovPrediction.probability - 0.5) * 60);
    if (markovPrediction.color === 'red') {
      redScore += markovScore;
      reasons.push(`Markov: ${(markovPrediction.probability * 100).toFixed(0)}% (${markovPrediction.sampleSize} amostras)`);
    } else {
      blackScore += markovScore;
      reasons.push(`Markov: ${(markovPrediction.probability * 100).toFixed(0)}% (${markovPrediction.sampleSize} amostras)`);
    }
  }
  
  // 2. GAP ANALYSIS (weight: medium-high)
  const redGap = calculateGapStats(colors, 'red');
  const blackGap = calculateGapStats(colors, 'black');
  
  const redHeatScore = getHeatZoneScore(redGap);
  const blackHeatScore = getHeatZoneScore(blackGap);
  
  redScore += redHeatScore;
  blackScore += blackHeatScore;
  
  if (redHeatScore > 20) {
    reasons.push(`Vermelho atrasado: ${redGap.currentGap} rodadas (média: ${redGap.avgGap.toFixed(1)})`);
  }
  if (blackHeatScore > 20) {
    reasons.push(`Preto atrasado: ${blackGap.currentGap} rodadas (média: ${blackGap.avgGap.toFixed(1)})`);
  }
  
  // 3. STREAK ANALYSIS (weight: medium)
  const streakAnalysis = analyzeStreaks(colors);
  const streakRec = getStreakRecommendation(streakAnalysis);
  
  if (streakRec.strategy !== 'neutral') {
    const oppositeColor = streakAnalysis.currentStreak.color === 'red' ? 'black' : 'red';
    
    if (streakRec.strategy === 'counter') {
      if (oppositeColor === 'red') {
        redScore += streakRec.score;
      } else {
        blackScore += streakRec.score;
      }
    } else { // follow
      if (streakAnalysis.currentStreak.color === 'red') {
        redScore += streakRec.score;
      } else {
        blackScore += streakRec.score;
      }
    }
    
    if (streakRec.score >= 15) {
      reasons.push(streakRec.reason);
    }
  }
  
  // 4. FREQUENCY/EQUALIZATION ANALYSIS (weight: medium)
  const freq10 = calculateFrequency(colors, 10);
  const freq30 = calculateFrequency(colors, 30);
  const freq100 = calculateFrequency(colors, Math.min(100, colors.length));
  
  const eqScore = getEqualizationScore(freq10, freq30, freq100);
  redScore += eqScore.redScore;
  blackScore += eqScore.blackScore;
  
  if (eqScore.reason) {
    reasons.push(eqScore.reason);
  }
  
  // 5. LEARNED PATTERNS (weight: medium-high)
  const patternMatches = findMatchingPatterns(colors, learnedPatterns);
  const patternScore = getPatternScore(patternMatches);
  
  redScore += patternScore.redScore;
  blackScore += patternScore.blackScore;
  
  if (patternScore.reason) {
    reasons.push(patternScore.reason);
  }
  
  // 6. TIME-BASED ADJUSTMENT (weight: low)
  // Some hours tend to favor certain colors based on historical data
  const timeBonus = getTimeBonus(hour);
  redScore += timeBonus.red;
  blackScore += timeBonus.black;
  
  // BUILD FINAL PREDICTION
  const scoreDiff = Math.abs(redScore - blackScore);
  const totalScore = Math.abs(redScore) + Math.abs(blackScore);
  
  // Need minimum score difference for confidence
  if (scoreDiff < 15 || totalScore < 30) {
    return {
      signal: null,
      analysis: buildAnalysisFactors(input, redGap, blackGap, streakAnalysis, freq10, freq30),
      debug: { redScore, blackScore, reasons: ['Diferença de score insuficiente'] }
    };
  }
  
  const predictedColor: Color = redScore > blackScore ? 'red' : 'black';
  const winningScore = Math.max(redScore, blackScore);
  
  // Calculate confidence (50-95%)
  // Based on: score difference, number of reasons, absolute score
  let confidence = 50;
  confidence += Math.min(scoreDiff / 2, 20); // Up to +20 from diff
  confidence += Math.min(reasons.length * 3, 15); // Up to +15 from reasons
  confidence += Math.min(winningScore / 5, 10); // Up to +10 from absolute score
  
  confidence = Math.min(Math.round(confidence), 95);
  
  // Determine strategy used
  const strategy = determineStrategy(markovPrediction, streakRec, patternMatches.length > 0);
  
  const signal: PredictionSignal = {
    id: `pred_${Date.now()}`,
    color: predictedColor,
    confidence,
    reason: reasons.slice(0, 2).join(' | ') || 'Análise híbrida',
    timestamp: new Date(),
    status: 'pending',
    strategy
  };
  
  return {
    signal,
    analysis: buildAnalysisFactors(input, redGap, blackGap, streakAnalysis, freq10, freq30),
    debug: { redScore, blackScore, reasons }
  };
}

function getTimeBonus(hour: number): { red: number; black: number } {
  // Based on typical patterns - evening/night tends to have more action
  // These are small adjustments
  if (hour >= 20 || hour < 2) {
    return { red: 3, black: 2 }; // Slight red tendency at night
  }
  if (hour >= 10 && hour < 14) {
    return { red: 2, black: 3 }; // Slight black tendency midday
  }
  return { red: 0, black: 0 };
}

function determineStrategy(
  markov: { color: Color | null },
  streak: { strategy: string; score: number },
  hasPatterns: boolean
): PredictionSignal['strategy'] {
  if (hasPatterns) return 'hybrid';
  if (markov.color) return 'markov';
  if (streak.strategy === 'counter') return 'counter';
  if (streak.strategy === 'follow') return 'trend';
  return 'gap';
}

function createEmptyAnalysis(hour: number, minute: number): AnalysisFactors {
  return {
    markovScore: { red: 0, black: 0 },
    redGap: 0,
    blackGap: 0,
    avgRedGap: 0,
    avgBlackGap: 0,
    currentStreak: { color: 'red', count: 0 },
    maxStreak: { red: 0, black: 0 },
    last10: { red: 0, black: 0, white: 0 },
    last30: { red: 0, black: 0, white: 0 },
    learnedPatternScore: { red: 0, black: 0 },
    hour,
    minute
  };
}

function buildAnalysisFactors(
  input: PredictionInput,
  redGap: ReturnType<typeof calculateGapStats>,
  blackGap: ReturnType<typeof calculateGapStats>,
  streakAnalysis: ReturnType<typeof analyzeStreaks>,
  freq10: ReturnType<typeof calculateFrequency>,
  freq30: ReturnType<typeof calculateFrequency>
): AnalysisFactors {
  return {
    markovScore: { red: 0, black: 0 }, // Simplified
    redGap: redGap.currentGap,
    blackGap: blackGap.currentGap,
    avgRedGap: redGap.avgGap,
    avgBlackGap: blackGap.avgGap,
    currentStreak: { 
      color: streakAnalysis.currentStreak.color, 
      count: streakAnalysis.currentStreak.length 
    },
    maxStreak: { red: streakAnalysis.maxRedStreak, black: streakAnalysis.maxBlackStreak },
    last10: { red: freq10.red, black: freq10.black, white: freq10.white },
    last30: { red: freq30.red, black: freq30.black, white: freq30.white },
    learnedPatternScore: { red: 0, black: 0 },
    hour: input.hour,
    minute: input.minute
  };
}
