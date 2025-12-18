// Pattern matcher - matches current sequence against learned patterns
// Searches for exact and fuzzy matches in pattern history

import { Color } from '@/types/prediction';

export interface LearnedPattern {
  sequence: Color[];
  nextColor: Color;
  occurrences: number;
  successRate: number;
}

export interface PatternMatch {
  pattern: LearnedPattern;
  matchType: 'exact' | 'fuzzy';
  similarity: number;
}

// Convert DB pattern data to LearnedPattern
export function parsePatternFromDb(patternData: any): LearnedPattern | null {
  try {
    return {
      sequence: patternData.sequence || [],
      nextColor: patternData.next_color || patternData.nextColor,
      occurrences: patternData.times_seen || patternData.occurrences || 1,
      successRate: patternData.success_rate || patternData.successRate || 50
    };
  } catch {
    return null;
  }
}

// Find patterns that match current sequence
export function findMatchingPatterns(
  currentSequence: Color[],
  patterns: LearnedPattern[],
  minOccurrences: number = 3,
  minSuccessRate: number = 55
): PatternMatch[] {
  const matches: PatternMatch[] = [];
  const seqLength = currentSequence.length;
  
  for (const pattern of patterns) {
    if (pattern.occurrences < minOccurrences) continue;
    if (pattern.successRate < minSuccessRate) continue;
    
    const patternLength = pattern.sequence.length;
    
    // Exact match
    if (patternLength <= seqLength) {
      const compareSeq = currentSequence.slice(0, patternLength);
      if (arraysEqual(compareSeq, pattern.sequence)) {
        matches.push({
          pattern,
          matchType: 'exact',
          similarity: 100
        });
        continue;
      }
    }
    
    // Fuzzy match (allow 1 difference for patterns of 4+)
    if (patternLength >= 4 && patternLength <= seqLength) {
      const compareSeq = currentSequence.slice(0, patternLength);
      const similarity = calculateSimilarity(compareSeq, pattern.sequence);
      
      if (similarity >= 75) {
        matches.push({
          pattern,
          matchType: 'fuzzy',
          similarity
        });
      }
    }
  }
  
  // Sort by: exact first, then by success rate * similarity
  matches.sort((a, b) => {
    if (a.matchType === 'exact' && b.matchType !== 'exact') return -1;
    if (b.matchType === 'exact' && a.matchType !== 'exact') return 1;
    return (b.pattern.successRate * b.similarity) - (a.pattern.successRate * a.similarity);
  });
  
  return matches.slice(0, 5); // Return top 5 matches
}

// Calculate pattern matching score for prediction
export function getPatternScore(
  matches: PatternMatch[]
): { redScore: number; blackScore: number; reason: string | null } {
  let redScore = 0;
  let blackScore = 0;
  let reason: string | null = null;
  
  for (const match of matches) {
    const { pattern, matchType, similarity } = match;
    
    // Weight by match type, success rate, and occurrences
    let weight = matchType === 'exact' ? 1 : (similarity / 100);
    weight *= Math.min(pattern.occurrences / 10, 1); // Cap at 10 occurrences
    weight *= (pattern.successRate / 100);
    
    const score = Math.round(20 * weight);
    
    if (pattern.nextColor === 'red') {
      redScore += score;
      if (!reason && score >= 10) {
        reason = `Padrão aprendido: ${pattern.successRate.toFixed(0)}% taxa de acerto (${pattern.occurrences}x)`;
      }
    } else if (pattern.nextColor === 'black') {
      blackScore += score;
      if (!reason && score >= 10) {
        reason = `Padrão aprendido: ${pattern.successRate.toFixed(0)}% taxa de acerto (${pattern.occurrences}x)`;
      }
    }
  }
  
  return { redScore, blackScore, reason };
}

// Helper functions
function arraysEqual(a: Color[], b: Color[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
}

function calculateSimilarity(a: Color[], b: Color[]): number {
  if (a.length !== b.length) return 0;
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) matches++;
  }
  return (matches / a.length) * 100;
}
