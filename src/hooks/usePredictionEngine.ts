// Prediction engine hook - generates predictions based on collected data

import { useState, useCallback, useRef, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAlertSound } from '@/hooks/useAlertSound';
import { Color, PredictionSignal, WhiteProtection, PredictionResult } from '@/types/prediction';
import { generatePrediction } from '@/lib/analysis/hybridPredictor';
import { analyzeWhiteGap } from '@/lib/analysis/gapAnalysis';
import { LearnedPattern, parsePatternFromDb } from '@/lib/analysis/patternMatcher';
import { supabase } from '@/integrations/supabase/client';

export type PredictionState = 'analyzing' | 'active' | 'gale1' | 'gale2';

interface UsePredictionEngineProps {
  colors: Color[];
  numbers: number[];
  enabled: boolean;
  intervalRounds: number;
}

export function usePredictionEngine({ 
  colors, 
  numbers, 
  enabled, 
  intervalRounds = 2 
}: UsePredictionEngineProps) {
  const { toast } = useToast();
  const { playAlertSound, playWhiteProtectionSound } = useAlertSound();
  
  const [currentSignal, setCurrentSignal] = useState<PredictionSignal | null>(null);
  const [whiteProtection, setWhiteProtection] = useState<WhiteProtection | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState<PredictionResult['analysis'] | null>(null);
  const [stats, setStats] = useState({ wins: 0, losses: 0 });
  const [galeLevel, setGaleLevel] = useState<0 | 1 | 2>(0);
  const [predictionState, setPredictionState] = useState<PredictionState>('analyzing');
  
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
    if (colors.length < 10 || isAnalyzing) return;
    
    setIsAnalyzing(true);
    setPredictionState('analyzing');
    
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
        shouldProtect: whiteAnalysis.isOverdue && whiteAnalysis.probability >= 15,
        confidence: Math.round(whiteAnalysis.probability),
        reason: whiteAnalysis.isOverdue 
          ? `${whiteAnalysis.roundsSinceWhite} rodadas sem branco (média: ${whiteAnalysis.avgGapBetweenWhites.toFixed(0)})`
          : `Branco recente - ${whiteAnalysis.roundsSinceWhite} rodadas`,
        roundsSinceWhite: whiteAnalysis.roundsSinceWhite,
        avgGap: whiteAnalysis.avgGapBetweenWhites
      };
      
      setWhiteProtection(whiteProtection);
      setLastAnalysis(result.analysis);
      
      // Lower threshold for signals - generate more predictions
      if (result.signal || result.debug.redScore > 10 || result.debug.blackScore > 10) {
        let signal = result.signal;
        
        // Create signal even if original didn't meet threshold
        if (!signal && (result.debug.redScore > 10 || result.debug.blackScore > 10)) {
          const predictedColor: Color = result.debug.redScore > result.debug.blackScore ? 'red' : 'black';
          const scoreDiff = Math.abs(result.debug.redScore - result.debug.blackScore);
          const confidence = Math.min(95, 45 + scoreDiff);
          
          signal = {
            id: `pred_${Date.now()}`,
            color: predictedColor,
            confidence: Math.round(confidence),
            reason: result.debug.reasons.slice(0, 2).join(' | ') || 'Análise de padrões',
            timestamp: new Date(),
            status: 'pending',
            strategy: 'hybrid'
          };
        }
        
        if (signal) {
          setCurrentSignal(signal);
          setGaleLevel(0);
          setPredictionState('active');
          pendingVerification.current = signal;
          predictionRoundIndex.current = colors.length;
          
          // Save to database
          await savePredictionToDb(signal);
          
          const isHighConfidence = signal.confidence >= 70;
          
          // Play alert sound for new signal
          playAlertSound(isHighConfidence);
          
          // Play white protection sound if needed
          if (whiteProtection.shouldProtect) {
            setTimeout(() => playWhiteProtectionSound(whiteProtection.confidence), 500);
          }
          
          toast({
            title: isHighConfidence ? '🔥 SINAL FORTE!' : '🎯 Novo Sinal',
            description: `${signal.color === 'red' ? 'VERMELHO' : 'PRETO'} - ${signal.confidence}%`,
          });
          
          console.log('✅ Previsão gerada:', {
            color: signal.color,
            confidence: signal.confidence,
            strategy: signal.strategy,
            reasons: result.debug.reasons
          });
        }
      } else {
        console.log('⏸️ Sem sinal claro:', result.debug.reasons);
      }
    } catch (error) {
      console.error('Prediction error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [colors, numbers, toast, playAlertSound, playWhiteProtectionSound]);

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
    
    // Skip white outcomes - wait for next round
    if (actualColor === 'white') {
      console.log('⚪ Branco - aguardando próxima rodada (gale mantido)');
      predictionRoundIndex.current = colors.length;
      return;
    }
    
    const won = actualColor === predicted.color;
    
    if (won) {
      // WIN - count as success
      setStats(prev => ({ wins: prev.wins + 1, losses: prev.losses }));
      setCurrentSignal(prev => prev ? { ...prev, status: 'won' } : null);
      
      toast({
        title: galeLevel === 0 ? '✅ ACERTO!' : `✅ ACERTO no Gale ${galeLevel}!`,
        description: `Previsto: ${predicted.color} | Real: ${actualColor}`,
      });
      
      console.log(`✅ Previsão CORRETA ${galeLevel > 0 ? `(Gale ${galeLevel})` : ''}`, { predicted: predicted.color, actual: actualColor });
      
      // Update in database
      updatePredictionResult(predicted.id, actualColor, true);
      updateLearnedPatterns(colors, actualColor, true);
      
      // Reset state
      pendingVerification.current = null;
      predictionRoundIndex.current = null;
      setGaleLevel(0);
      
      setTimeout(() => {
        setCurrentSignal(null);
        setPredictionState('analyzing');
      }, 3000);
      
    } else {
      // LOSS - check gale level
      if (galeLevel < 2) {
        // Move to next gale
        const nextGale = (galeLevel + 1) as 1 | 2;
        setGaleLevel(nextGale);
        setPredictionState(nextGale === 1 ? 'gale1' : 'gale2');
        predictionRoundIndex.current = colors.length;
        
        // Play gale alert sound (urgent tone)
        playAlertSound(true);
        
        toast({
          title: `⚠️ Gale ${nextGale}`,
          description: `Continuando com ${predicted.color === 'red' ? 'VERMELHO' : 'PRETO'}`,
          variant: 'destructive'
        });
        
        console.log(`⚠️ Gale ${nextGale} ativado`);
        
      } else {
        // All gales exhausted - count as loss
        setStats(prev => ({ wins: prev.wins, losses: prev.losses + 1 }));
        setCurrentSignal(prev => prev ? { ...prev, status: 'lost' } : null);
        
        toast({
          title: '❌ LOSS (após 2 gales)',
          description: `Previsto: ${predicted.color} | Real: ${actualColor}`,
          variant: 'destructive'
        });
        
        console.log('❌ Previsão INCORRETA após 2 gales', { predicted: predicted.color, actual: actualColor });
        
        // Update in database
        updatePredictionResult(predicted.id, actualColor, false);
        updateLearnedPatterns(colors, actualColor, false);
        
        // Reset state
        pendingVerification.current = null;
        predictionRoundIndex.current = null;
        setGaleLevel(0);
        
        setTimeout(() => {
          setCurrentSignal(null);
          setPredictionState('analyzing');
        }, 3000);
      }
    }
  }, [colors, toast, galeLevel]);

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
    if (!enabled || colors.length < 10) return;
    
    const currentCount = colors.length;
    const roundsSinceLastPrediction = currentCount - lastRoundCount.current;
    
    // Verify pending prediction first
    if (pendingVerification.current) {
      verifyPrediction();
      return; // Don't generate new prediction while one is pending
    }
    
    // Check for high confidence prediction opportunity (90%+)
    // This requires a quick pre-check before the interval
    const shouldCheckHighConfidence = roundsSinceLastPrediction >= 1;
    
    // Prediction every 2 rounds OR if 90%+ confidence detected
    const effectiveInterval = 2; // Fixed at 2 rounds
    
    // Check if it's time for new prediction (every 2 rounds)
    if (roundsSinceLastPrediction >= effectiveInterval) {
      lastRoundCount.current = currentCount;
      generateNewPrediction();
    } else if (shouldCheckHighConfidence && !isAnalyzing) {
      // Pre-check for high confidence opportunity
      checkHighConfidenceOpportunity();
    }
  }, [colors.length, enabled, intervalRounds, generateNewPrediction, verifyPrediction]);
  
  // Check for high confidence opportunity (90%+)
  const checkHighConfidenceOpportunity = useCallback(async () => {
    if (colors.length < 10 || isAnalyzing || pendingVerification.current) return;
    
    try {
      const { hour, minute } = getBrasiliaTime();
      const learnedPatterns = await loadLearnedPatterns();
      
      const result = generatePrediction({
        colors,
        numbers,
        learnedPatterns,
        hour,
        minute
      });
      
      // Only generate if 90%+ confidence
      if (result.signal && result.signal.confidence >= 90) {
        console.log('🔥 Alta confiança detectada (90%+), gerando previsão imediata!');
        lastRoundCount.current = colors.length;
        generateNewPrediction();
      }
    } catch (error) {
      console.error('High confidence check error:', error);
    }
  }, [colors, numbers, isAnalyzing, generateNewPrediction]);

  return {
    currentSignal,
    whiteProtection,
    isAnalyzing,
    lastAnalysis,
    stats,
    galeLevel,
    predictionState,
    generateNewPrediction
  };
}
