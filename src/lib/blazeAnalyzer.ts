import { BlazeColor, BlazeRound, BlazeStats, PredictionSignal } from '@/types/blaze';

export function calculateStats(rounds: BlazeRound[]): BlazeStats {
  const totalRounds = rounds.length;
  
  const redCount = rounds.filter(r => r.color === 'red').length;
  const blackCount = rounds.filter(r => r.color === 'black').length;
  const whiteCount = rounds.filter(r => r.color === 'white').length;

  const redPercentage = totalRounds > 0 ? (redCount / totalRounds) * 100 : 0;
  const blackPercentage = totalRounds > 0 ? (blackCount / totalRounds) * 100 : 0;
  const whitePercentage = totalRounds > 0 ? (whiteCount / totalRounds) * 100 : 0;

  // Calculate streaks
  let maxRedStreak = 0;
  let maxBlackStreak = 0;
  let currentRedStreak = 0;
  let currentBlackStreak = 0;

  for (const round of rounds) {
    if (round.color === 'red') {
      currentRedStreak++;
      currentBlackStreak = 0;
      maxRedStreak = Math.max(maxRedStreak, currentRedStreak);
    } else if (round.color === 'black') {
      currentBlackStreak++;
      currentRedStreak = 0;
      maxBlackStreak = Math.max(maxBlackStreak, currentBlackStreak);
    } else {
      currentRedStreak = 0;
      currentBlackStreak = 0;
    }
  }

  // Current streak
  let currentStreak: { color: BlazeColor; count: number } = { color: 'red', count: 0 };
  if (rounds.length > 0) {
    const lastColor = rounds[rounds.length - 1].color;
    let count = 0;
    for (let i = rounds.length - 1; i >= 0; i--) {
      if (rounds[i].color === lastColor) {
        count++;
      } else {
        break;
      }
    }
    currentStreak = { color: lastColor, count };
  }

  const lastColors = rounds.slice(-20).map(r => r.color);

  return {
    totalRounds,
    redCount,
    blackCount,
    whiteCount,
    redPercentage,
    blackPercentage,
    whitePercentage,
    maxRedStreak,
    maxBlackStreak,
    currentStreak,
    lastColors,
  };
}

export function analyzePatternsAndPredict(rounds: BlazeRound[]): PredictionSignal | null {
  if (rounds.length < 5) return null;

  const last10 = rounds.slice(-10);
  const last5 = rounds.slice(-5);
  
  // Pattern 1: Alternating pattern detection
  const isAlternating = checkAlternatingPattern(last5);
  
  // Pattern 2: Streak break prediction
  const stats = calculateStats(rounds);
  const streakBreakPrediction = predictStreakBreak(stats, last10);
  
  // Pattern 3: Frequency imbalance
  const frequencyPrediction = predictByFrequency(stats, last10);
  
  // Pattern 4: Gale pattern
  const galePrediction = predictGalePattern(last10);

  // Combine predictions with weights
  const predictions: { color: BlazeColor; confidence: number; reason: string }[] = [];

  if (isAlternating) {
    const lastColor = last5[last5.length - 1].color;
    const predictedColor = lastColor === 'red' ? 'black' : 'red';
    predictions.push({
      color: predictedColor,
      confidence: 65,
      reason: 'Padrão alternado detectado',
    });
  }

  if (streakBreakPrediction) {
    predictions.push(streakBreakPrediction);
  }

  if (frequencyPrediction) {
    predictions.push(frequencyPrediction);
  }

  if (galePrediction) {
    predictions.push(galePrediction);
  }

  if (predictions.length === 0) return null;

  // Get the prediction with highest confidence
  predictions.sort((a, b) => b.confidence - a.confidence);
  const bestPrediction = predictions[0];

  // Calculate protections based on confidence
  const protections = bestPrediction.confidence >= 70 ? 2 : 1;

  return {
    id: crypto.randomUUID(),
    predictedColor: bestPrediction.color,
    confidence: bestPrediction.confidence,
    reason: bestPrediction.reason,
    timestamp: new Date(),
    status: 'pending',
    protections,
  };
}

function checkAlternatingPattern(rounds: BlazeRound[]): boolean {
  if (rounds.length < 4) return false;
  
  let alternatingCount = 0;
  for (let i = 1; i < rounds.length; i++) {
    if (
      (rounds[i].color === 'red' && rounds[i - 1].color === 'black') ||
      (rounds[i].color === 'black' && rounds[i - 1].color === 'red')
    ) {
      alternatingCount++;
    }
  }
  
  return alternatingCount >= 3;
}

function predictStreakBreak(
  stats: BlazeStats,
  last10: BlazeRound[]
): { color: BlazeColor; confidence: number; reason: string } | null {
  const { currentStreak } = stats;
  
  // If streak is >= 4, predict break
  if (currentStreak.count >= 4 && currentStreak.color !== 'white') {
    const oppositeColor = currentStreak.color === 'red' ? 'black' : 'red';
    const confidence = Math.min(50 + currentStreak.count * 5, 80);
    
    return {
      color: oppositeColor,
      confidence,
      reason: `Sequência de ${currentStreak.count}x ${currentStreak.color === 'red' ? 'VERMELHO' : 'PRETO'} - Quebra provável`,
    };
  }
  
  return null;
}

function predictByFrequency(
  stats: BlazeStats,
  last10: BlazeRound[]
): { color: BlazeColor; confidence: number; reason: string } | null {
  const redIn10 = last10.filter(r => r.color === 'red').length;
  const blackIn10 = last10.filter(r => r.color === 'black').length;
  
  // If one color is significantly less frequent, predict it
  if (redIn10 <= 2 && blackIn10 >= 6) {
    return {
      color: 'red',
      confidence: 60,
      reason: `Vermelho em baixa frequência (${redIn10}/10) - Tendência de equalização`,
    };
  }
  
  if (blackIn10 <= 2 && redIn10 >= 6) {
    return {
      color: 'black',
      confidence: 60,
      reason: `Preto em baixa frequência (${blackIn10}/10) - Tendência de equalização`,
    };
  }
  
  return null;
}

function predictGalePattern(last10: BlazeRound[]): { color: BlazeColor; confidence: number; reason: string } | null {
  if (last10.length < 6) return null;
  
  // Check for double pattern (AA BB pattern)
  const last6 = last10.slice(-6);
  const colors = last6.map(r => r.color);
  
  // Pattern: XX YY - predict Y
  if (
    colors[0] === colors[1] &&
    colors[2] === colors[3] &&
    colors[0] !== colors[2] &&
    colors[4] !== 'white' &&
    colors[5] !== 'white'
  ) {
    if (colors[4] === colors[5]) {
      const oppositeColor = colors[4] === 'red' ? 'black' : 'red';
      return {
        color: oppositeColor,
        confidence: 55,
        reason: 'Padrão duplo detectado (Gale)',
      };
    }
  }
  
  return null;
}

export function generateMockRounds(count: number): BlazeRound[] {
  const rounds: BlazeRound[] = [];
  const colors: BlazeColor[] = ['red', 'black'];
  
  for (let i = 0; i < count; i++) {
    // 2% chance for white, 49% each for red/black
    const rand = Math.random();
    let color: BlazeColor;
    let number: number;
    
    if (rand < 0.02) {
      color = 'white';
      number = 0;
    } else if (rand < 0.51) {
      color = 'red';
      number = Math.floor(Math.random() * 7) + 1;
    } else {
      color = 'black';
      number = Math.floor(Math.random() * 7) + 8;
    }
    
    rounds.push({
      id: crypto.randomUUID(),
      color,
      number,
      timestamp: new Date(Date.now() - (count - i) * 30000),
    });
  }
  
  return rounds;
}
