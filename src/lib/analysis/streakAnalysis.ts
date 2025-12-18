// Streak analysis - analyzes consecutive color sequences
// Key insight: long streaks tend to break, but short streaks might continue

import { Color } from '@/types/prediction';

export interface StreakInfo {
  color: Color;
  length: number;
}

export interface StreakAnalysis {
  currentStreak: StreakInfo;
  maxRedStreak: number;
  maxBlackStreak: number;
  avgStreakLength: number;
  recentStreaks: StreakInfo[];
  breakProbability: number;
}

export function analyzeStreaks(colors: Color[]): StreakAnalysis {
  if (colors.length === 0) {
    return {
      currentStreak: { color: 'red', length: 0 },
      maxRedStreak: 0,
      maxBlackStreak: 0,
      avgStreakLength: 0,
      recentStreaks: [],
      breakProbability: 50
    };
  }
  
  // Calculate current streak
  let currentStreak: StreakInfo = { color: colors[0], length: 0 };
  for (const c of colors) {
    if (c === currentStreak.color) {
      currentStreak.length++;
    } else if (c !== 'white') {
      break;
    }
  }
  
  // Find all streaks
  const streaks: StreakInfo[] = [];
  let streakColor: Color | null = null;
  let streakLength = 0;
  
  for (const c of colors) {
    if (c === 'white') continue;
    
    if (c === streakColor) {
      streakLength++;
    } else {
      if (streakColor && streakLength > 0) {
        streaks.push({ color: streakColor, length: streakLength });
      }
      streakColor = c;
      streakLength = 1;
    }
  }
  if (streakColor && streakLength > 0) {
    streaks.push({ color: streakColor, length: streakLength });
  }
  
  // Calculate max streaks
  const maxRedStreak = Math.max(...streaks.filter(s => s.color === 'red').map(s => s.length), 0);
  const maxBlackStreak = Math.max(...streaks.filter(s => s.color === 'black').map(s => s.length), 0);
  
  // Average streak length
  const avgStreakLength = streaks.length > 0
    ? streaks.reduce((a, s) => a + s.length, 0) / streaks.length
    : 2;
  
  // Calculate break probability based on streak length
  // Longer streaks have higher break probability
  let breakProbability = 50; // Base 50%
  if (currentStreak.length >= 2) breakProbability = 55;
  if (currentStreak.length >= 3) breakProbability = 60;
  if (currentStreak.length >= 4) breakProbability = 68;
  if (currentStreak.length >= 5) breakProbability = 75;
  if (currentStreak.length >= 6) breakProbability = 82;
  if (currentStreak.length >= 7) breakProbability = 88;
  
  return {
    currentStreak,
    maxRedStreak,
    maxBlackStreak,
    avgStreakLength,
    recentStreaks: streaks.slice(0, 10),
    breakProbability
  };
}

// Predicts whether to follow or counter the trend
export function getStreakRecommendation(
  analysis: StreakAnalysis
): { strategy: 'follow' | 'counter' | 'neutral'; score: number; reason: string } {
  const { currentStreak, avgStreakLength, breakProbability } = analysis;
  
  // Short streak (1-2): might continue
  if (currentStreak.length <= 1) {
    return {
      strategy: 'neutral',
      score: 0,
      reason: 'Sequência muito curta para análise'
    };
  }
  
  // Medium streak (2-3): balanced, slight counter tendency
  if (currentStreak.length <= 3) {
    if (currentStreak.length >= avgStreakLength) {
      return {
        strategy: 'counter',
        score: 15,
        reason: `Sequência de ${currentStreak.length}x ${currentStreak.color} atingiu média`
      };
    }
    return {
      strategy: 'follow',
      score: 10,
      reason: `Sequência de ${currentStreak.length}x ${currentStreak.color} ainda abaixo da média`
    };
  }
  
  // Long streak (4+): strong counter signal
  return {
    strategy: 'counter',
    score: Math.min(35 + (currentStreak.length - 4) * 8, 60),
    reason: `Sequência longa de ${currentStreak.length}x ${currentStreak.color} - ${breakProbability}% chance de quebra`
  };
}
