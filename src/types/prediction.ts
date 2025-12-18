// Core prediction types - clean and focused

export type Color = 'red' | 'black' | 'white';

export interface Round {
  id: string;
  blazeId: string;
  color: Color;
  number: number;
  timestamp: Date;
}

export interface PredictionSignal {
  id: string;
  color: Color;
  confidence: number;
  reason: string;
  timestamp: Date;
  status: 'pending' | 'won' | 'lost';
  strategy: 'trend' | 'counter' | 'markov' | 'gap' | 'hybrid';
}

export interface WhiteProtection {
  shouldProtect: boolean;
  confidence: number;
  reason: string;
  roundsSinceWhite: number;
  avgGap: number;
}

export interface AnalysisFactors {
  // Markov chain transitions (order 3)
  markovScore: { red: number; black: number };
  
  // Gap analysis
  redGap: number;
  blackGap: number;
  avgRedGap: number;
  avgBlackGap: number;
  
  // Streak analysis
  currentStreak: { color: Color; count: number };
  maxStreak: { red: number; black: number };
  
  // Frequency in windows
  last10: { red: number; black: number; white: number };
  last30: { red: number; black: number; white: number };
  
  // Pattern matches from learned data
  learnedPatternScore: { red: number; black: number };
  
  // Time factors
  hour: number;
  minute: number;
}

export interface PredictionResult {
  signal: PredictionSignal | null;
  whiteProtection: WhiteProtection | null;
  analysis: AnalysisFactors;
}
