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

export interface PredictionSignal {
  id: string;
  predictedColor: BlazeColor;
  confidence: number;
  reason: string;
  timestamp: Date;
  status: 'pending' | 'win' | 'loss';
  protections: number;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
