import { useState, useCallback, useRef } from 'react';
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
  patterns_used?: string[];
  afterRound?: {
    number: number;
    color: BlazeColor;
    blaze_id?: string;
    uniqueKey?: string;
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
  learnedPatternsCount?: number;
  matchedPatternsCount?: number;
}

interface CurrentPatternInfo {
  type: string;
  key: string;
  data?: any;
}

export function useAIPrediction() {
  const [isLoading, setIsLoading] = useState(false);
  const [lastPrediction, setLastPrediction] = useState<AIPrediction | null>(null);
  const [aiStats, setAiStats] = useState<AIStats | null>(null);
  const [consecutiveLosses, setConsecutiveLosses] = useState(0);
  const [isRecalibrating, setIsRecalibrating] = useState(false);
  const [currentPatterns, setCurrentPatterns] = useState<CurrentPatternInfo[]>([]);
  const { toast } = useToast();
  const { playAlertSound } = useAlertSound();
  
  // Store last prediction info for learning
  const lastPredictionRef = useRef<{
    id: string;
    predictedColor: BlazeColor;
    patterns: CurrentPatternInfo[];
    roundId?: string;
  } | null>(null);

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

      const rawPrediction = data.prediction;
      const stats: AIStats = data.stats || {
        last20Stats: { red: 0, black: 0, white: 0 },
        last50Stats: { red: 0, black: 0, white: 0 },
        currentStreak: { color: '', count: 0 },
        winRate: '0%',
        totalSignals: 0,
        consecutiveLosses: 0,
        learnedPatternsCount: 0,
        matchedPatternsCount: 0
      };
      const lastRound = data.lastRound;
      const patterns = data.currentPatterns || [];

      // Ensure analysis is a string, not an object
      let analysisStr = '';
      if (rawPrediction.analysis) {
        if (typeof rawPrediction.analysis === 'string') {
          analysisStr = rawPrediction.analysis;
        } else if (typeof rawPrediction.analysis === 'object') {
          // Convert analysis object to readable string
          const a = rawPrediction.analysis;
          const parts = [];
          if (a.time) parts.push(`Horário: ${a.time.hour}:${a.time.minute}`);
          if (a.scores) parts.push(`Scores: R${a.scores.red}/B${a.scores.black}`);
          if (a.streak) parts.push(`Streak: ${a.streak.count}x ${a.streak.color}`);
          analysisStr = parts.join(' | ');
        }
      }

      // Ensure reason is always a string
      const reasonStr = typeof rawPrediction.reason === 'string' 
        ? rawPrediction.reason 
        : (typeof rawPrediction.reason === 'object' 
            ? JSON.stringify(rawPrediction.reason) 
            : 'Análise multi-fator');

      const prediction: AIPrediction = {
        ...rawPrediction,
        reason: reasonStr,
        analysis: analysisStr,
      };

      // Add lastRound and recalibration flag to prediction
      if (lastRound) {
        prediction.afterRound = lastRound;
      }
      prediction.isRecalibration = needsRecalibration;

      setLastPrediction(prediction);
      setCurrentPatterns(patterns);
      setAiStats({ 
        ...stats, 
        consecutiveLosses,
        learnedPatternsCount: stats?.learnedPatternsCount || 0,
        matchedPatternsCount: stats?.matchedPatternsCount || 0
      });
      
      if (needsRecalibration) {
        setIsRecalibrating(false);
        toast({
          title: '🔄 RECALIBRAÇÃO ATIVADA',
          description: 'IA recalculando após 2 erros - Nova estratégia com aprendizado!',
        });
      }

      console.log('AI Prediction received:', prediction);
      console.log('Patterns identified:', patterns);

      if (prediction.should_bet && prediction.confidence >= 70) {
        const isHighConfidence = prediction.confidence >= 80;
        playAlertSound(isHighConfidence);

        const signalId = crypto.randomUUID();
        
        // Store for learning
        lastPredictionRef.current = {
          id: signalId,
          predictedColor: prediction.predicted_color,
          patterns: patterns,
          roundId: lastRound?.uniqueKey
        };

        const learnedInfo = stats.matchedPatternsCount && stats.matchedPatternsCount > 0 
          ? ` (${stats.matchedPatternsCount} padrões)` 
          : '';

        toast({
          title: needsRecalibration ? '🔄 IA: NOVA ESTRATÉGIA!' : 
                 isHighConfidence ? '🤖 IA: SINAL FORTE!' : '🤖 IA: Novo Sinal!',
          description: `${prediction.predicted_color === 'red' ? 'VERMELHO' : 'PRETO'} - ${prediction.confidence}% confiança${learnedInfo}`,
        });

        return {
          id: signalId,
          predictedColor: prediction.predicted_color,
          confidence: prediction.confidence,
          reason: needsRecalibration ? `[RECALIBRAÇÃO] ${prediction.reason}` : `[IA] ${prediction.reason}`,
          timestamp: new Date(),
          status: 'pending',
          protections: prediction.protections,
          galeLevel: 0,
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

  // Update learned patterns with result
  const updateLearning = useCallback(async (actualColor: BlazeColor, wasCorrect: boolean) => {
    if (!lastPredictionRef.current) {
      console.log('No prediction to update learning for');
      return;
    }

    try {
      console.log('Updating learning with result:', {
        predicted: lastPredictionRef.current.predictedColor,
        actual: actualColor,
        wasCorrect,
        patterns: lastPredictionRef.current.patterns.length
      });

      const { data, error } = await supabase.functions.invoke('update-learned-patterns', {
        body: {
          predictedColor: lastPredictionRef.current.predictedColor,
          actualColor,
          patterns: lastPredictionRef.current.patterns,
          roundId: lastPredictionRef.current.id,
          wasCorrect
        }
      });

      if (error) {
        console.error('Error updating learning:', error);
      } else {
        console.log('Learning updated successfully:', data);
        
        if (data?.stats) {
          toast({
            title: wasCorrect ? '✅ Padrão Aprendido!' : '📊 Aprendizado Atualizado',
            description: `${data.stats.totalPatterns} padrões • ${data.stats.highSuccessPatterns} com alta taxa`,
          });
        }
      }
    } catch (e) {
      console.error('Error in updateLearning:', e);
    }
  }, [toast]);

  // Track prediction results
  const recordWin = useCallback(async (actualColor: BlazeColor) => {
    setConsecutiveLosses(0);
    console.log('Win recorded - consecutive losses reset');
    await updateLearning(actualColor, true);
  }, [updateLearning]);

  const recordLoss = useCallback(async (actualColor: BlazeColor) => {
    const newCount = consecutiveLosses + 1;
    setConsecutiveLosses(newCount);
    console.log(`Loss recorded - consecutive losses: ${newCount}`);
    await updateLearning(actualColor, false);
  }, [consecutiveLosses, updateLearning]);

  return {
    getAIPrediction,
    isLoading,
    lastPrediction,
    aiStats,
    consecutiveLosses,
    isRecalibrating,
    recordWin,
    recordLoss,
    currentPatterns,
  };
}