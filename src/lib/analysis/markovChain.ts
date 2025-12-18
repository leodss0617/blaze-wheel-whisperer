// Higher-order Markov Chain analysis (order 3)
// Analyzes transitions based on last 3 colors, not just 1

import { Color } from '@/types/prediction';

type TransitionKey = string; // e.g., "red-black-red"
type TransitionMap = Map<TransitionKey, { red: number; black: number; total: number }>;

export function buildMarkovChain(colors: Color[], order: number = 3): TransitionMap {
  const transitions: TransitionMap = new Map();
  
  if (colors.length < order + 1) return transitions;
  
  for (let i = order; i < colors.length; i++) {
    // Skip if any of the sequence or next color is white
    const sequence = colors.slice(i - order, i);
    const next = colors[i];
    
    if (sequence.some(c => c === 'white') || next === 'white') continue;
    
    const key = sequence.join('-');
    
    if (!transitions.has(key)) {
      transitions.set(key, { red: 0, black: 0, total: 0 });
    }
    
    const entry = transitions.get(key)!;
    entry[next]++;
    entry.total++;
  }
  
  return transitions;
}

export function predictFromMarkov(
  colors: Color[], 
  chain: TransitionMap, 
  order: number = 3
): { color: Color | null; probability: number; sampleSize: number } {
  if (colors.length < order) {
    return { color: null, probability: 0, sampleSize: 0 };
  }
  
  // Get last 'order' colors (excluding white)
  const recentNonWhite = colors.filter(c => c !== 'white').slice(-order);
  
  if (recentNonWhite.length < order) {
    return { color: null, probability: 0, sampleSize: 0 };
  }
  
  const key = recentNonWhite.join('-');
  const entry = chain.get(key);
  
  if (!entry || entry.total < 5) { // Need at least 5 samples for reliability
    return { color: null, probability: 0, sampleSize: entry?.total || 0 };
  }
  
  const redProb = entry.red / entry.total;
  const blackProb = entry.black / entry.total;
  
  // Need significant difference (> 55%) to make prediction
  if (redProb > 0.55) {
    return { color: 'red', probability: redProb, sampleSize: entry.total };
  } else if (blackProb > 0.55) {
    return { color: 'black', probability: blackProb, sampleSize: entry.total };
  }
  
  return { color: null, probability: Math.max(redProb, blackProb), sampleSize: entry.total };
}
