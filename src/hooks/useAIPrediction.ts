import { useState, useCallback } from 'react';
import { BlazeColor, PredictionSignal } from '@/types/blaze';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAlertSound } from '@/hooks/useAlertSound';

export interface AIPrediction {
  predicted_color: BlazeColor;
  confidence: number;
  reason: string;
  analysis: string;
  protections: number;
  should_bet: boolean;
  afterRound?: {
    number: number;
    color: BlazeColor;
  };
}

export interface AIStats {
  last20Stats: { red: number; black: number; white: number };
  last50Stats: { red: number; black: number; white: number };
  currentStreak: { color: string; count: number };
  winRate: string;
  totalSignals: number;
}

export function useAIPrediction() {
  const [isLoading, setIsLoading] = useState(false);
  const [lastPrediction, setLastPrediction] = useState<AIPrediction | null>(null);
  const [aiStats, setAiStats] = useState<AIStats | null>(null);
  const { toast } = useToast();
  const { playAlertSound } = useAlertSound();

  const getAIPrediction = useCallback(async (): Promise<PredictionSignal | null> => {
    setIsLoading(true);
    
    try {
      console.log('Requesting AI prediction...');
      
      const { data, error } = await supabase.functions.invoke('ai-predict', {
        body: {},
      });

      if (error) {
        console.error('AI prediction error:', error);
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const prediction: AIPrediction = data.prediction;
      const stats: AIStats = data.stats;
      const lastRound = data.lastRound;

      // Add lastRound to prediction
      if (lastRound) {
        prediction.afterRound = lastRound;
      }

      setLastPrediction(prediction);
      setAiStats(stats);

      console.log('AI Prediction received:', prediction);

      if (prediction.should_bet && prediction.confidence >= 70) {
        const isHighConfidence = prediction.confidence >= 80;
        playAlertSound(isHighConfidence);

        toast({
          title: isHighConfidence ? '🤖 IA: SINAL FORTE!' : '🤖 IA: Novo Sinal!',
          description: `${prediction.predicted_color === 'red' ? 'VERMELHO' : 'PRETO'} - ${prediction.confidence}% confiança`,
        });

        return {
          id: crypto.randomUUID(),
          predictedColor: prediction.predicted_color,
          confidence: prediction.confidence,
          reason: `[IA] ${prediction.reason}`,
          timestamp: new Date(),
          status: 'pending',
          protections: prediction.protections,
        };
      }

      return null;
    } catch (error) {
      console.error('Error getting AI prediction:', error);
      toast({
        title: '❌ Erro na IA',
        description: error instanceof Error ? error.message : 'Erro ao obter previsão',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast, playAlertSound]);

  return {
    getAIPrediction,
    isLoading,
    lastPrediction,
    aiStats,
  };
}
