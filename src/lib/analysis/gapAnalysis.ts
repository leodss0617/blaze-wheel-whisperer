// Gap analysis - analyzes distance between color occurrences
// Uses "heat zones" concept where colors tend to appear after certain gap thresholds

import { Color } from '@/types/prediction';

export interface GapStats {
  currentGap: number;
  avgGap: number;
  maxGap: number;
  minGap: number;
  gapHistory: number[];
}

export function calculateGapStats(colors: Color[], targetColor: Color): GapStats {
  let currentGap = 0;
  const gaps: number[] = [];
  let gap = 0;
  
  // Calculate current gap (how many rounds since target color)
  for (const c of colors) {
    if (c === targetColor) break;
    if (c !== 'white') currentGap++;
  }
  
  // Calculate all gaps in history
  for (const c of colors) {
    if (c === targetColor) {
      if (gap > 0) gaps.push(gap);
      gap = 0;
    } else if (c !== 'white') {
      gap++;
    }
  }
  
  if (gaps.length === 0) {
    return { currentGap, avgGap: 0, maxGap: 0, minGap: 0, gapHistory: [] };
  }
  
  return {
    currentGap,
    avgGap: gaps.reduce((a, b) => a + b, 0) / gaps.length,
    maxGap: Math.max(...gaps),
    minGap: Math.min(...gaps),
    gapHistory: gaps.slice(0, 20) // Keep last 20 gaps
  };
}

// Heat zone analysis - probability increases when gap exceeds average
export function getHeatZoneScore(stats: GapStats): number {
  if (stats.avgGap === 0) return 0;
  
  const gapRatio = stats.currentGap / stats.avgGap;
  
  // Score increases exponentially as gap exceeds average
  if (gapRatio < 0.5) return -20; // Color appeared recently, unlikely to appear again
  if (gapRatio < 0.8) return -10;
  if (gapRatio < 1.0) return 0;
  if (gapRatio < 1.2) return 10;
  if (gapRatio < 1.5) return 20;
  if (gapRatio < 2.0) return 35;
  return 50; // Very overdue - high probability
}

// White-specific gap analysis
export interface WhiteGapAnalysis {
  roundsSinceWhite: number;
  avgGapBetweenWhites: number;
  probability: number;
  isOverdue: boolean;
}

export function analyzeWhiteGap(colors: Color[]): WhiteGapAnalysis {
  let roundsSinceWhite = 0;
  const gaps: number[] = [];
  let gap = 0;
  
  for (const c of colors) {
    if (c === 'white') {
      if (gap > 0) gaps.push(gap);
      gap = 0;
      if (roundsSinceWhite === 0) {
        // First white found, start counting for subsequent whites
      }
    } else {
      gap++;
      if (gaps.length === 0) roundsSinceWhite++;
    }
  }
  
  // Count rounds since last white
  roundsSinceWhite = 0;
  for (const c of colors) {
    if (c === 'white') break;
    roundsSinceWhite++;
  }
  
  const avgGap = gaps.length > 0 
    ? gaps.reduce((a, b) => a + b, 0) / gaps.length 
    : 14; // Default theoretical average
  
  const gapRatio = roundsSinceWhite / avgGap;
  
  // Base probability ~7% (1/14), increases with gap ratio
  let probability = 7;
  if (gapRatio > 1.0) probability = 7 + (gapRatio - 1) * 15;
  if (gapRatio > 1.5) probability = 15 + (gapRatio - 1.5) * 20;
  if (gapRatio > 2.0) probability = 25 + (gapRatio - 2) * 30;
  
  probability = Math.min(probability, 80); // Cap at 80%
  
  return {
    roundsSinceWhite,
    avgGapBetweenWhites: avgGap,
    probability,
    isOverdue: roundsSinceWhite > avgGap * 1.5
  };
}
