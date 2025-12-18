// Frequency analysis - analyzes color distribution in windows
// Based on the "equalization tendency" theory

import { Color } from '@/types/prediction';

export interface FrequencyStats {
  red: number;
  black: number;
  white: number;
  total: number;
  redPercentage: number;
  blackPercentage: number;
}

export function calculateFrequency(colors: Color[], windowSize: number): FrequencyStats {
  const window = colors.slice(0, windowSize);
  
  const red = window.filter(c => c === 'red').length;
  const black = window.filter(c => c === 'black').length;
  const white = window.filter(c => c === 'white').length;
  const total = window.length;
  const nonWhite = red + black;
  
  return {
    red,
    black,
    white,
    total,
    redPercentage: nonWhite > 0 ? (red / nonWhite) * 100 : 50,
    blackPercentage: nonWhite > 0 ? (black / nonWhite) * 100 : 50
  };
}

// Equalization analysis - when one color is underrepresented, it tends to appear
export function getEqualizationScore(
  short: FrequencyStats, // last 10
  medium: FrequencyStats, // last 30
  long: FrequencyStats // last 100
): { redScore: number; blackScore: number; reason: string | null } {
  let redScore = 0;
  let blackScore = 0;
  let reasons: string[] = [];
  
  // Short window imbalance (strong signal)
  const shortNonWhite = short.red + short.black;
  if (shortNonWhite >= 8) {
    if (short.redPercentage < 30) {
      redScore += 25;
      reasons.push(`Vermelho baixo nas últimas ${shortNonWhite} (${short.red}/${shortNonWhite})`);
    } else if (short.blackPercentage < 30) {
      blackScore += 25;
      reasons.push(`Preto baixo nas últimas ${shortNonWhite} (${short.black}/${shortNonWhite})`);
    }
  }
  
  // Medium window imbalance (moderate signal)
  const medNonWhite = medium.red + medium.black;
  if (medNonWhite >= 20) {
    if (medium.redPercentage < 35) {
      redScore += 15;
      reasons.push(`Vermelho subrepresentado (${medium.redPercentage.toFixed(0)}% em ${medNonWhite})`);
    } else if (medium.blackPercentage < 35) {
      blackScore += 15;
      reasons.push(`Preto subrepresentado (${medium.blackPercentage.toFixed(0)}% em ${medNonWhite})`);
    }
  }
  
  // Long window extreme imbalance (weak but persistent signal)
  const longNonWhite = long.red + long.black;
  if (longNonWhite >= 50) {
    if (long.redPercentage < 40) {
      redScore += 8;
    } else if (long.blackPercentage < 40) {
      blackScore += 8;
    }
  }
  
  return {
    redScore,
    blackScore,
    reason: reasons.length > 0 ? reasons[0] : null
  };
}
