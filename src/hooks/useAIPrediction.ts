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
  isRecalibration?: boolean;
}

export interface AIStats {
  last20Stats: { red: number; black: number; white: number };
  last50Stats: { red: number; black: number; white: number };
  currentStreak: { color: string; count: number };
  winRate: string;
  totalSignals: number;
  consecutiveLosses: number;
}

export function useAIPrediction() {
  const [isLoading, setIsLoading] = useState(false);
  const [lastPrediction, setLastPrediction] = useState<AIPrediction | null>(null);
  const [aiStats, setAiStats] = useState<AIStats | null>(null);
  const [consecutiveLosses, setConsecutiveLosses] = useState(0);
  const [isRecalibrating, setIsRecalibrating] = useState(false);
  const { toast } = useToast();
  const { playAlertSound } = useAlertSound();

  const getAIPrediction = useCallback(async (forceRecalibration = false): Promise<PredictionSignal | null> => {
    setIsLoading(true);
    const needsRecalibration = forceRecalibration || consecutiveLosses >= 2;
    
    if (needsRecalibration) {
      setIsRecalibrating(true);
    }
    
    try {
      console.log('Requesting AI prediction...', needsRecalibration ? '(RECALIBRATION MODE)' : '');
      
      const { data, error } = await supabase.functions.invoke('ai-predict', {
        body: { recalibrationMode: needsRecalibration },
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

      // Add lastRound and recalibration flag to prediction
      if (lastRound) {
        prediction.afterRound = lastRound;
      }
      prediction.isRecalibration = needsRecalibration;

      setLastPrediction(prediction);
      setAiStats({ ...stats, consecutiveLosses });
      
      if (needsRecalibration) {
        setIsRecalibrating(false);
        toast({
          title: '🔄 RECALIBRAÇÃO ATIVADA',
          description: 'IA recalculando após 2 erros - Nova estratégia!',
        });
      }

      console.log('AI Prediction received:', prediction);

      if (prediction.should_bet && prediction.confidence >= 70) {
        const isHighConfidence = prediction.confidence >= 80;
        playAlertSound(isHighConfidence);

        toast({
          title: needsRecalibration ? '🔄 IA: NOVA ESTRATÉGIA!' : 
                 isHighConfidence ? '🤖 IA: SINAL FORTE!' : '🤖 IA: Novo Sinal!',
          description: `${prediction.predicted_color === 'red' ? 'VERMELHO' : 'PRETO'} - ${prediction.confidence}% confiança`,
        });

        return {
          id: crypto.randomUUID(),
          predictedColor: prediction.predicted_color,
          confidence: prediction.confidence,
          reason: needsRecalibration ? `[RECALIBRAÇÃO] ${prediction.reason}` : `[IA] ${prediction.reason}`,
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
      setIsRecalibrating(false);
    }
  }, [toast, playAlertSound, consecutiveLosses]);

  // Track prediction results
  const recordWin = useCallback(() => {
    setConsecutiveLosses(0);
    console.log('Win recorded - consecutive losses reset');
  }, []);

  const recordLoss = useCallback(() => {
    setConsecutiveLosses(prev => {
      const newCount = prev + 1;
      console.log(`Loss recorded - consecutive losses: ${newCount}`);
      return newCount;
    });
  }, []);

  return {
    getAIPrediction,
    isLoading,
    lastPrediction,
    aiStats,
    consecutiveLosses,
    isRecalibrating,
    recordWin,
    recordLoss,
  };
}
