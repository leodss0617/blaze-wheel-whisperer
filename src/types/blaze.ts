export type BlazeColor = 'red' | 'black' | 'white';

export interface BlazeRound {
  id: string;
  color: BlazeColor;
  number: number;
  timestamp: Date;
}

export interface BlazeStats {
  totalRounds: number;
  redCount: number;
  blackCount: number;
  whiteCount: number;
  redPercentage: number;
  blackPercentage: number;
  whitePercentage: number;
  maxRedStreak: number;
  maxBlackStreak: number;
  currentStreak: {
    color: BlazeColor;
    count: number;
  };
  lastColors: BlazeColor[];
}

export type PredictionState = 'analyzing' | 'active' | 'gale1' | 'gale2';

export interface PredictionSignal {
  id: string;
  predictedColor: BlazeColor;
  confidence: number;
  reason: string;
  timestamp: Date;
  status: 'pending' | 'win' | 'loss';
  protections: number;
  actualResult?: BlazeColor;
  afterRound?: {
    number: number;
    color: BlazeColor;
  };
  galeLevel: number; // 0 = normal, 1 = gale1, 2 = gale2
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
