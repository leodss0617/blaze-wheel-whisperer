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
  
  if (colors.length < 10) {
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
  
  if (markovPrediction.color && markovPrediction.sampleSize >= 3) {
    const markovScore = Math.round((markovPrediction.probability - 0.5) * 80);
    if (markovPrediction.color === 'red') {
      redScore += markovScore;
      reasons.push(`Markov: ${(markovPrediction.probability * 100).toFixed(0)}%`);
    } else {
      blackScore += markovScore;
      reasons.push(`Markov: ${(markovPrediction.probability * 100).toFixed(0)}%`);
    }
  }
  
  // 2. GAP ANALYSIS (weight: high - key for overdue colors)
  const redGap = calculateGapStats(colors, 'red');
  const blackGap = calculateGapStats(colors, 'black');
  
  const redHeatScore = getHeatZoneScore(redGap);
  const blackHeatScore = getHeatZoneScore(blackGap);
  
  redScore += redHeatScore * 1.5;
  blackScore += blackHeatScore * 1.5;
  
  if (redHeatScore > 15) {
    reasons.push(`Vermelho atrasado: ${redGap.currentGap} rodadas`);
  }
  if (blackHeatScore > 15) {
    reasons.push(`Preto atrasado: ${blackGap.currentGap} rodadas`);
  }
  
  // 3. STREAK ANALYSIS (weight: high - critical for reversal detection)
  const streakAnalysis = analyzeStreaks(colors);
  const streakRec = getStreakRecommendation(streakAnalysis);
  
  if (streakRec.strategy !== 'neutral') {
    const oppositeColor = streakAnalysis.currentStreak.color === 'red' ? 'black' : 'red';
    
    if (streakRec.strategy === 'counter') {
      if (oppositeColor === 'red') {
        redScore += streakRec.score * 1.5;
      } else {
        blackScore += streakRec.score * 1.5;
      }
    } else { // follow
      if (streakAnalysis.currentStreak.color === 'red') {
        redScore += streakRec.score * 1.2;
      } else {
        blackScore += streakRec.score * 1.2;
      }
    }
    
    if (streakRec.score >= 10) {
      reasons.push(streakRec.reason);
    }
  }
  
  // 4. FREQUENCY/EQUALIZATION ANALYSIS (weight: medium-high)
  const freq10 = calculateFrequency(colors, 10);
  const freq30 = calculateFrequency(colors, 30);
  const freq100 = calculateFrequency(colors, Math.min(100, colors.length));
  
  const eqScore = getEqualizationScore(freq10, freq30, freq100);
  redScore += eqScore.redScore * 1.3;
  blackScore += eqScore.blackScore * 1.3;
  
  if (eqScore.reason) {
    reasons.push(eqScore.reason);
  }
  
  // 5. LEARNED PATTERNS (weight: very high - key for accuracy)
  const patternMatches = findMatchingPatterns(colors, learnedPatterns);
  const patternScore = getPatternScore(patternMatches);
  
  redScore += patternScore.redScore * 2;
  blackScore += patternScore.blackScore * 2;
  
  if (patternScore.reason) {
    reasons.push(patternScore.reason);
  }
  
  // 6. LAST COLOR ALTERNATION ANALYSIS
  const last5 = colors.slice(0, 5).filter(c => c !== 'white');
  const alternations = countAlternations(last5);
  
  if (alternations >= 3) {
    // High alternation - predict opposite of last
    const lastNonWhite = last5[0];
    if (lastNonWhite === 'red') {
      blackScore += 15;
      reasons.push('Alta alternância');
    } else if (lastNonWhite === 'black') {
      redScore += 15;
      reasons.push('Alta alternância');
    }
  }
  
  // 7. TIME-BASED ADJUSTMENT (weight: low)
  const timeBonus = getTimeBonus(hour);
  redScore += timeBonus.red;
  blackScore += timeBonus.black;
  
  // 8. NUMBER PATTERN ANALYSIS
  if (numbers.length >= 5) {
    const lastNum = numbers[0];
    const numPatternScore = analyzeNumberPattern(numbers, colors);
    redScore += numPatternScore.red;
    blackScore += numPatternScore.black;
    if (numPatternScore.reason) {
      reasons.push(numPatternScore.reason);
    }
  }
  
  // BUILD FINAL PREDICTION
  const scoreDiff = Math.abs(redScore - blackScore);
  const totalScore = Math.abs(redScore) + Math.abs(blackScore);
  
  // Lower threshold for more signals
  if (scoreDiff < 8 || totalScore < 15) {
    return {
      signal: null,
      analysis: buildAnalysisFactors(input, redGap, blackGap, streakAnalysis, freq10, freq30),
      debug: { redScore, blackScore, reasons: ['Diferença de score insuficiente', ...reasons] }
    };
  }
  
  const predictedColor: Color = redScore > blackScore ? 'red' : 'black';
  const winningScore = Math.max(redScore, blackScore);
  
  // Enhanced confidence calculation
  let confidence = 45;
  confidence += Math.min(scoreDiff / 1.5, 25); // Up to +25 from diff
  confidence += Math.min(reasons.length * 4, 15); // Up to +15 from reasons
  confidence += Math.min(winningScore / 4, 10); // Up to +10 from absolute score
  
  // Boost for learned patterns
  if (patternScore.redScore > 0 || patternScore.blackScore > 0) {
    confidence += 5;
  }
  
  confidence = Math.min(Math.round(confidence), 95);
  
  // Determine strategy used
  const strategy = determineStrategy(markovPrediction, streakRec, patternMatches.length > 0);
  
  const signal: PredictionSignal = {
    id: `pred_${Date.now()}`,
    color: predictedColor,
    confidence,
    reason: reasons.slice(0, 3).join(' | ') || 'Análise híbrida',
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

function countAlternations(colors: Color[]): number {
  let count = 0;
  for (let i = 1; i < colors.length; i++) {
    if (colors[i] !== colors[i - 1]) count++;
  }
  return count;
}

function analyzeNumberPattern(numbers: number[], colors: Color[]): { red: number; black: number; reason: string } {
  const lastNum = numbers[0];
  const result = { red: 0, black: 0, reason: '' };
  
  // Count what follows specific number ranges
  const isLow = lastNum <= 7;
  let lowToRed = 0, lowToBlack = 0, highToRed = 0, highToBlack = 0;
  
  for (let i = 0; i < Math.min(50, numbers.length - 1); i++) {
    const num = numbers[i];
    const nextColor = colors[i];
    if (nextColor === 'white') continue;
    
    if (num <= 7) {
      if (nextColor === 'red') lowToRed++;
      else lowToBlack++;
    } else {
      if (nextColor === 'red') highToRed++;
      else highToBlack++;
    }
  }
  
  if (isLow) {
    const total = lowToRed + lowToBlack;
    if (total >= 10) {
      const redProb = lowToRed / total;
      if (redProb > 0.55) {
        result.red = (redProb - 0.5) * 20;
        result.reason = `Número baixo → vermelho ${(redProb * 100).toFixed(0)}%`;
      } else if (redProb < 0.45) {
        result.black = (0.5 - redProb) * 20;
        result.reason = `Número baixo → preto ${((1 - redProb) * 100).toFixed(0)}%`;
      }
    }
  } else {
    const total = highToRed + highToBlack;
    if (total >= 10) {
      const redProb = highToRed / total;
      if (redProb > 0.55) {
        result.red = (redProb - 0.5) * 20;
        result.reason = `Número alto → vermelho ${(redProb * 100).toFixed(0)}%`;
      } else if (redProb < 0.45) {
        result.black = (0.5 - redProb) * 20;
        result.reason = `Número alto → preto ${((1 - redProb) * 100).toFixed(0)}%`;
      }
    }
  }
  
  return result;
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
