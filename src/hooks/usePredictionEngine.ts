// Prediction engine hook - generates predictions based on collected data

import { useState, useCallback, useRef, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Color, PredictionSignal, WhiteProtection, PredictionResult } from '@/types/prediction';
import { generatePrediction } from '@/lib/analysis/hybridPredictor';
import { analyzeWhiteGap } from '@/lib/analysis/gapAnalysis';
import { LearnedPattern, parsePatternFromDb } from '@/lib/analysis/patternMatcher';
import { supabase } from '@/integrations/supabase/client';

interface UsePredictionEngineProps {
  colors: Color[];
  numbers: number[];
  enabled: boolean;
  intervalRounds: number; // Generate prediction every N rounds
}

export function usePredictionEngine({ 
  colors, 
  numbers, 
  enabled, 
  intervalRounds = 2 
}: UsePredictionEngineProps) {
  const { toast } = useToast();
  
  const [currentSignal, setCurrentSignal] = useState<PredictionSignal | null>(null);
  const [whiteProtection, setWhiteProtection] = useState<WhiteProtection | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState<PredictionResult['analysis'] | null>(null);
  const [stats, setStats] = useState({ wins: 0, losses: 0 });
  
  const lastRoundCount = useRef(0);
  const pendingVerification = useRef<PredictionSignal | null>(null);
  const predictionRoundIndex = useRef<number | null>(null);
  
  // Load learned patterns from DB
  const loadLearnedPatterns = async (): Promise<LearnedPattern[]> => {
    try {
      const { data } = await supabase
        .from('learned_patterns')
        .select('pattern_data, success_rate, times_seen')
        .gte('success_rate', 55)
        .gte('times_seen', 3)
        .order('success_rate', { ascending: false })
        .limit(50);
      
      if (!data) return [];
      
      return data
        .map(row => {
          const patternData = typeof row.pattern_data === 'object' && row.pattern_data !== null
            ? row.pattern_data as Record<string, unknown>
            : {};
          return parsePatternFromDb({
            ...patternData,
            success_rate: row.success_rate,
            times_seen: row.times_seen
          });
        })
        .filter((p): p is LearnedPattern => p !== null);
    } catch {
      return [];
    }
  };

  // Get Brasília time
  const getBrasiliaTime = () => {
    const now = new Date();
    const brasiliaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    return { hour: brasiliaTime.getHours(), minute: brasiliaTime.getMinutes() };
  };

  // Generate prediction
  const generateNewPrediction = useCallback(async () => {
    if (colors.length < 15 || isAnalyzing) return;
    
    setIsAnalyzing(true);
    
    try {
      const { hour, minute } = getBrasiliaTime();
      const learnedPatterns = await loadLearnedPatterns();
      
      // Generate main color prediction
      const result = generatePrediction({
        colors,
        numbers,
        learnedPatterns,
        hour,
        minute
      });
      
      // Generate white protection analysis
      const whiteAnalysis = analyzeWhiteGap(colors);
      const whiteProtection: WhiteProtection = {
        shouldProtect: whiteAnalysis.isOverdue && whiteAnalysis.probability >= 20,
        confidence: Math.round(whiteAnalysis.probability),
        reason: whiteAnalysis.isOverdue 
          ? `${whiteAnalysis.roundsSinceWhite} rodadas sem branco (média: ${whiteAnalysis.avgGapBetweenWhites.toFixed(0)})`
          : `Branco recente - ${whiteAnalysis.roundsSinceWhite} rodadas`,
        roundsSinceWhite: whiteAnalysis.roundsSinceWhite,
        avgGap: whiteAnalysis.avgGapBetweenWhites
      };
      
      setWhiteProtection(whiteProtection);
      setLastAnalysis(result.analysis);
      
      if (result.signal) {
        setCurrentSignal(result.signal);
        pendingVerification.current = result.signal;
        predictionRoundIndex.current = colors.length;
        
        // Save to database
        await savePredictionToDb(result.signal);
        
        const isHighConfidence = result.signal.confidence >= 75;
        toast({
          title: isHighConfidence ? '🔥 SINAL FORTE!' : '🎯 Novo Sinal',
          description: `${result.signal.color === 'red' ? 'VERMELHO' : 'PRETO'} - ${result.signal.confidence}%`,
        });
        
        console.log('✅ Previsão gerada:', {
          color: result.signal.color,
          confidence: result.signal.confidence,
          strategy: result.signal.strategy,
          reasons: result.debug.reasons
        });
      } else {
        console.log('⏸️ Sem sinal claro:', result.debug.reasons);
      }
    } catch (error) {
      console.error('Prediction error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [colors, numbers, toast]);

  // Save prediction to database
  const savePredictionToDb = async (signal: PredictionSignal) => {
    try {
      await supabase.from('prediction_signals').insert({
        predicted_color: signal.color,
        confidence: signal.confidence,
        reason: signal.reason,
        signal_timestamp: signal.timestamp.toISOString(),
        status: 'pending',
        protections: 2
      });
    } catch (err) {
      console.error('Error saving prediction:', err);
    }
  };

  // Verify prediction result
  const verifyPrediction = useCallback(() => {
    if (!pendingVerification.current || predictionRoundIndex.current === null) return;
    
    // Wait for new round after prediction
    if (colors.length <= predictionRoundIndex.current) return;
    
    const actualColor = colors[0]; // Most recent color
    const predicted = pendingVerification.current;
    
    // Skip white outcomes for win/loss calculation
    if (actualColor === 'white') {
      console.log('⚪ Branco - aguardando próxima rodada');
      return;
    }
    
    const won = actualColor === predicted.color;
    
    setStats(prev => ({
      wins: won ? prev.wins + 1 : prev.wins,
      losses: won ? prev.losses : prev.losses + 1
    }));
    
    // Update signal status
    setCurrentSignal(prev => prev ? { ...prev, status: won ? 'won' : 'lost' } : null);
    
    // Update in database
    updatePredictionResult(predicted.id, actualColor, won);
    
    // Update learned patterns
    updateLearnedPatterns(colors, actualColor, won);
    
    toast({
      title: won ? '✅ ACERTO!' : '❌ ERRO',
      description: `Previsto: ${predicted.color} | Real: ${actualColor}`,
      variant: won ? 'default' : 'destructive'
    });
    
    console.log(won ? '✅ Previsão CORRETA' : '❌ Previsão INCORRETA', { predicted: predicted.color, actual: actualColor });
    
    // Clear pending verification
    pendingVerification.current = null;
    predictionRoundIndex.current = null;
    
    // Clear signal after short delay
    setTimeout(() => {
      setCurrentSignal(null);
    }, 3000);
  }, [colors, toast]);

  // Update prediction result in DB
  const updatePredictionResult = async (id: string, actualColor: Color, won: boolean) => {
    try {
      await supabase
        .from('prediction_signals')
        .update({ 
          status: won ? 'won' : 'lost',
          actual_result: actualColor 
        })
        .eq('id', id);
    } catch (err) {
      console.error('Error updating prediction:', err);
    }
  };

  // Update learned patterns based on result
  const updateLearnedPatterns = async (recentColors: Color[], actualColor: Color, wasCorrect: boolean) => {
    try {
      await supabase.functions.invoke('update-learned-patterns', {
        body: {
          recentColors: recentColors.slice(0, 10),
          actualColor,
          wasCorrect
        }
      });
    } catch (err) {
      console.error('Error updating patterns:', err);
    }
  };

  // Effect: Check for prediction opportunity on each new round
  useEffect(() => {
    if (!enabled || colors.length < 15) return;
    
    const currentCount = colors.length;
    const roundsSinceLastPrediction = currentCount - lastRoundCount.current;
    
    // Verify pending prediction first
    if (pendingVerification.current) {
      verifyPrediction();
    }
    
    // Check if it's time for new prediction
    if (!pendingVerification.current && roundsSinceLastPrediction >= intervalRounds) {
      lastRoundCount.current = currentCount;
      generateNewPrediction();
    }
  }, [colors.length, enabled, intervalRounds, generateNewPrediction, verifyPrediction]);

  return {
    currentSignal,
    whiteProtection,
    isAnalyzing,
    lastAnalysis,
    stats,
    generateNewPrediction
  };
}
