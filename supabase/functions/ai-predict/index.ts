import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LearnedPattern {
  pattern_type: string;
  pattern_key: string;
  pattern_data: any;
  times_seen: number;
  times_correct: number;
  success_rate: number;
}

interface PredictionScore {
  color: 'red' | 'black';
  score: number;
  reasons: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { recalibrationMode = false, lastPrediction = null } = await req.json().catch(() => ({}));
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    console.log('AI Predict called - Recalibration mode:', recalibrationMode);

    // Fetch recent rounds from database
    const { data: recentRounds, error: roundsError } = await supabase
      .from('blaze_rounds')
      .select('*')
      .order('round_timestamp', { ascending: false })
      .limit(200);

    if (roundsError) {
      console.error('Error fetching rounds:', roundsError);
      throw roundsError;
    }

    // Fetch learned patterns
    const { data: learnedPatterns, error: patternsError } = await supabase
      .from('learned_patterns')
      .select('*')
      .order('success_rate', { ascending: false })
      .limit(150);

    if (patternsError) {
      console.error('Error fetching patterns:', patternsError);
    }

    // Fetch recent signals with their outcomes
    const { data: pastSignals, error: signalsError } = await supabase
      .from('prediction_signals')
      .select('*')
      .order('signal_timestamp', { ascending: false })
      .limit(200);

    if (signalsError) {
      console.error('Error fetching signals:', signalsError);
    }

    // Calculate performance metrics
    const completedSignals = pastSignals?.filter(s => s.status !== 'pending') || [];
    const wins = completedSignals.filter(s => s.status === 'win').length;
    const losses = completedSignals.filter(s => s.status === 'loss').length;
    const winRate = completedSignals.length > 0 ? (wins / completedSignals.length * 100) : 0;

    // Extract color arrays
    const last10Rounds = recentRounds?.slice(0, 10) || [];
    const last20Rounds = recentRounds?.slice(0, 20) || [];
    const last50Rounds = recentRounds?.slice(0, 50) || [];
    const last100Rounds = recentRounds?.slice(0, 100) || [];
    
    const last10Colors = last10Rounds.map(r => r.color);
    const last20Colors = last20Rounds.map(r => r.color);
    const last50Colors = last50Rounds.map(r => r.color);
    const last100Colors = last100Rounds.map(r => r.color);

    // Create unique round identifiers
    const roundIdentifiers = last20Rounds.map(r => ({
      id: r.blaze_id,
      color: r.color,
      number: r.number,
      timestamp: r.round_timestamp,
      uniqueKey: `${r.blaze_id}_${r.number}_${new Date(r.round_timestamp).getTime()}`
    }));
    
    // Color counting utility
    const countColors = (colors: string[]) => ({
      red: colors.filter(c => c === 'red').length,
      black: colors.filter(c => c === 'black').length,
      white: colors.filter(c => c === 'white').length,
    });

    const last10Stats = countColors(last10Colors);
    const last20Stats = countColors(last20Colors);
    const last50Stats = countColors(last50Colors);
    const last100Stats = countColors(last100Colors);

    // ==================== ADVANCED PREDICTION ALGORITHMS ====================

    // Initialize prediction scores
    let redScore = 0;
    let blackScore = 0;
    const redReasons: string[] = [];
    const blackReasons: string[] = [];

    // 1. MARKOV CHAIN ANALYSIS - Transition probabilities
    const buildMarkovChain = (colors: string[]) => {
      const transitions: Record<string, Record<string, number>> = {
        red: { red: 0, black: 0 },
        black: { red: 0, black: 0 },
        white: { red: 0, black: 0 }
      };
      
      for (let i = 0; i < colors.length - 1; i++) {
        const current = colors[i];
        const next = colors[i + 1];
        if (next !== 'white' && transitions[current]) {
          transitions[current][next]++;
        }
      }
      
      // Normalize to probabilities
      for (const state of Object.keys(transitions)) {
        const total = transitions[state].red + transitions[state].black;
        if (total > 0) {
          transitions[state].red /= total;
          transitions[state].black /= total;
        }
      }
      
      return transitions;
    };

    const markovChain = buildMarkovChain(last100Colors);
    const lastColor = last10Colors[0];
    
    if (lastColor && markovChain[lastColor]) {
      const redProb = markovChain[lastColor].red;
      const blackProb = markovChain[lastColor].black;
      
      if (redProb > blackProb + 0.1) {
        redScore += (redProb - blackProb) * 20;
        redReasons.push(`Markov: ${(redProb * 100).toFixed(0)}% após ${lastColor}`);
      } else if (blackProb > redProb + 0.1) {
        blackScore += (blackProb - redProb) * 20;
        blackReasons.push(`Markov: ${(blackProb * 100).toFixed(0)}% após ${lastColor}`);
      }
    }

    // 2. STREAK ANALYSIS - Enhanced
    let currentStreak = { color: last10Colors[0], count: 1 };
    for (let i = 1; i < last20Colors.length; i++) {
      if (last20Colors[i] === currentStreak.color && last20Colors[i] !== 'white') {
        currentStreak.count++;
      } else if (last20Colors[i] !== 'white') {
        break;
      }
    }

    // Dynamic streak strategy based on historical data
    const streakBreakAnalysis = () => {
      let streaksContinued = 0;
      let streaksBroken = 0;
      
      for (let i = 0; i < last100Colors.length - 3; i++) {
        const seq = last100Colors.slice(i, i + 4).filter(c => c !== 'white');
        if (seq.length >= 3 && seq[0] === seq[1] && seq[1] === seq[2]) {
          if (seq.length >= 4 && seq[2] === seq[3]) {
            streaksContinued++;
          } else if (seq.length >= 4) {
            streaksBroken++;
          }
        }
      }
      
      return { continued: streaksContinued, broken: streaksBroken };
    };

    const streakHistory = streakBreakAnalysis();
    const streakBreakRate = streakHistory.broken / Math.max(1, streakHistory.continued + streakHistory.broken);

    if (currentStreak.count >= 3 && currentStreak.color !== 'white') {
      const oppositeColor = currentStreak.color === 'red' ? 'black' : 'red';
      
      if (streakBreakRate > 0.55) {
        // History shows streaks tend to break
        if (oppositeColor === 'red') {
          redScore += currentStreak.count * 4 * streakBreakRate;
          redReasons.push(`Sequência ${currentStreak.count}x${currentStreak.color} (${(streakBreakRate*100).toFixed(0)}% quebra)`);
        } else {
          blackScore += currentStreak.count * 4 * streakBreakRate;
          blackReasons.push(`Sequência ${currentStreak.count}x${currentStreak.color} (${(streakBreakRate*100).toFixed(0)}% quebra)`);
        }
      } else if (currentStreak.count >= 5) {
        // Long streaks tend to break regardless
        if (oppositeColor === 'red') {
          redScore += 15;
          redReasons.push(`Sequência longa ${currentStreak.count}x - inversão provável`);
        } else {
          blackScore += 15;
          blackReasons.push(`Sequência longa ${currentStreak.count}x - inversão provável`);
        }
      }
    }

    // 3. GAP ANALYSIS - Time since last occurrence
    const getGap = (colors: string[], targetColor: string) => {
      const idx = colors.indexOf(targetColor);
      return idx === -1 ? colors.length : idx;
    };

    const redGap = getGap(last50Colors, 'red');
    const blackGap = getGap(last50Colors, 'black');
    
    // Calculate average gaps for context
    const calculateAverageGap = (colors: string[], targetColor: string) => {
      let gaps: number[] = [];
      let currentGap = 0;
      
      for (const color of colors) {
        if (color === targetColor) {
          if (currentGap > 0) gaps.push(currentGap);
          currentGap = 0;
        } else if (color !== 'white') {
          currentGap++;
        }
      }
      
      return gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 3;
    };

    const avgRedGap = calculateAverageGap(last100Colors, 'red');
    const avgBlackGap = calculateAverageGap(last100Colors, 'black');

    if (redGap > avgRedGap * 1.5) {
      redScore += Math.min(20, (redGap - avgRedGap) * 3);
      redReasons.push(`Gap vermelho: ${redGap} (média ${avgRedGap.toFixed(1)})`);
    }
    
    if (blackGap > avgBlackGap * 1.5) {
      blackScore += Math.min(20, (blackGap - avgBlackGap) * 3);
      blackReasons.push(`Gap preto: ${blackGap} (média ${avgBlackGap.toFixed(1)})`);
    }

    // 4. ALTERNATION PATTERN ANALYSIS
    const analyzeAlternation = (colors: string[]) => {
      let alternations = 0;
      const nonWhite = colors.filter(c => c !== 'white').slice(0, 10);
      
      for (let i = 0; i < nonWhite.length - 1; i++) {
        if (nonWhite[i] !== nonWhite[i + 1]) {
          alternations++;
        }
      }
      
      return alternations / Math.max(1, nonWhite.length - 1);
    };

    const alternationRate = analyzeAlternation(last20Colors);
    
    if (alternationRate > 0.7) {
      // High alternation - predict opposite of last
      const opposite = lastColor === 'red' ? 'black' : 'red';
      if (opposite === 'red') {
        redScore += 12;
        redReasons.push(`Alta alternância (${(alternationRate*100).toFixed(0)}%)`);
      } else {
        blackScore += 12;
        blackReasons.push(`Alta alternância (${(alternationRate*100).toFixed(0)}%)`);
      }
    } else if (alternationRate < 0.3) {
      // Low alternation - predict same as dominant trend
      const dominant = last10Stats.red > last10Stats.black ? 'red' : 'black';
      if (dominant === 'red') {
        redScore += 8;
        redReasons.push(`Baixa alternância - tendência ${dominant}`);
      } else {
        blackScore += 8;
        blackReasons.push(`Baixa alternância - tendência ${dominant}`);
      }
    }

    // 5. WEIGHTED MOMENTUM ANALYSIS
    const calculateMomentum = () => {
      // Recent rounds have more weight
      let redMomentum = 0;
      let blackMomentum = 0;
      
      const weights = [5, 4, 3, 2.5, 2, 1.5, 1.2, 1, 0.8, 0.6]; // Decreasing weights
      
      for (let i = 0; i < Math.min(10, last20Colors.length); i++) {
        const color = last20Colors[i];
        const weight = weights[i] || 0.5;
        
        if (color === 'red') {
          redMomentum += weight;
        } else if (color === 'black') {
          blackMomentum += weight;
        }
      }
      
      return { red: redMomentum, black: blackMomentum };
    };

    const momentum = calculateMomentum();
    const momentumDiff = Math.abs(momentum.red - momentum.black);
    
    if (momentumDiff > 5) {
      // Strong momentum - consider mean reversion
      const dominantMomentum = momentum.red > momentum.black ? 'red' : 'black';
      const weakMomentum = dominantMomentum === 'red' ? 'black' : 'red';
      
      // After strong momentum, expect some reversion
      if (weakMomentum === 'red') {
        redScore += momentumDiff * 1.5;
        redReasons.push(`Reversão de momentum (${dominantMomentum} forte)`);
      } else {
        blackScore += momentumDiff * 1.5;
        blackReasons.push(`Reversão de momentum (${dominantMomentum} forte)`);
      }
    }

    // 6. PATTERN SEQUENCE MATCHING (3-gram and 4-gram)
    const findPatternMatches = (colors: string[], gramSize: number) => {
      const currentGram = colors.slice(0, gramSize).join('-');
      let redFollows = 0;
      let blackFollows = 0;
      
      for (let i = gramSize; i < colors.length - 1; i++) {
        const gram = colors.slice(i, i + gramSize).join('-');
        if (gram === currentGram) {
          const nextColor = colors[i - 1]; // Color that came after this pattern
          if (nextColor === 'red') redFollows++;
          else if (nextColor === 'black') blackFollows++;
        }
      }
      
      return { red: redFollows, black: blackFollows, total: redFollows + blackFollows };
    };

    const pattern3 = findPatternMatches(last100Colors, 3);
    const pattern4 = findPatternMatches(last100Colors, 4);

    if (pattern3.total >= 3) {
      const redRate = pattern3.red / pattern3.total;
      const blackRate = pattern3.black / pattern3.total;
      
      if (redRate > 0.6) {
        redScore += (redRate - 0.5) * 30;
        redReasons.push(`Padrão 3-gram: ${(redRate*100).toFixed(0)}% vermelho (${pattern3.total} ocorrências)`);
      } else if (blackRate > 0.6) {
        blackScore += (blackRate - 0.5) * 30;
        blackReasons.push(`Padrão 3-gram: ${(blackRate*100).toFixed(0)}% preto (${pattern3.total} ocorrências)`);
      }
    }

    if (pattern4.total >= 2) {
      const redRate = pattern4.red / pattern4.total;
      const blackRate = pattern4.black / pattern4.total;
      
      if (redRate > 0.6) {
        redScore += (redRate - 0.5) * 40;
        redReasons.push(`Padrão 4-gram: ${(redRate*100).toFixed(0)}% vermelho`);
      } else if (blackRate > 0.6) {
        blackScore += (blackRate - 0.5) * 40;
        blackReasons.push(`Padrão 4-gram: ${(blackRate*100).toFixed(0)}% preto`);
      }
    }

    // 7. LEARNED PATTERNS INTEGRATION
    const matchedLearnedPatterns = (learnedPatterns || []).filter(lp => {
      // Match sequence patterns
      if (lp.pattern_type === 'sequence_3') {
        const seq = last20Colors.slice(0, 3).join('-');
        return lp.pattern_key === seq;
      }
      // Match streak patterns
      if (lp.pattern_type === 'streak') {
        return lp.pattern_key === `${currentStreak.color}_${currentStreak.count}`;
      }
      // Match dominance patterns
      if (lp.pattern_type === 'dominance_20') {
        const dominant = last20Stats.red > last20Stats.black ? 'red' : 'black';
        const ratio = Math.max(last20Stats.red, last20Stats.black) / 20;
        return lp.pattern_key === `${dominant}_${Math.round(ratio * 100)}`;
      }
      return false;
    });

    // Apply learned pattern scores
    for (const pattern of matchedLearnedPatterns) {
      if (pattern.times_seen >= 5 && pattern.success_rate > 55) {
        const weight = (pattern.success_rate / 100) * Math.log(pattern.times_seen + 1) * 5;
        const data = pattern.pattern_data;
        
        if (data.lastSuccessfulPrediction === 'red') {
          redScore += weight;
          redReasons.push(`Padrão aprendido: ${pattern.pattern_key} (${pattern.success_rate.toFixed(0)}%)`);
        } else if (data.lastSuccessfulPrediction === 'black') {
          blackScore += weight;
          blackReasons.push(`Padrão aprendido: ${pattern.pattern_key} (${pattern.success_rate.toFixed(0)}%)`);
        }
      }
    }

    // 8. EQUILIBRIUM ANALYSIS - Long-term balance
    const equilibriumBias = () => {
      // In theory, red and black should be ~equal over time
      const total = last100Stats.red + last100Stats.black;
      if (total < 50) return { color: null, strength: 0 };
      
      const redPct = last100Stats.red / total;
      const expectedPct = 0.5;
      const deviation = redPct - expectedPct;
      
      // If significant deviation, expect regression to mean
      if (Math.abs(deviation) > 0.08) {
        const underdog = deviation > 0 ? 'black' : 'red';
        return { color: underdog, strength: Math.abs(deviation) * 100 };
      }
      
      return { color: null, strength: 0 };
    };

    const equilibrium = equilibriumBias();
    if (equilibrium.color && equilibrium.strength > 5) {
      if (equilibrium.color === 'red') {
        redScore += equilibrium.strength * 0.8;
        redReasons.push(`Equilíbrio: vermelho sub-representado`);
      } else {
        blackScore += equilibrium.strength * 0.8;
        blackReasons.push(`Equilíbrio: preto sub-representado`);
      }
    }

    // 9. RECALIBRATION MODE ADJUSTMENTS
    if (recalibrationMode) {
      console.log('Applying recalibration adjustments...');
      // Invert recent losing strategy
      const recentLosses = completedSignals
        .filter(s => s.status === 'loss')
        .slice(0, 3);
      
      let lossRedCount = 0;
      let lossBlackCount = 0;
      
      for (const loss of recentLosses) {
        if (loss.predicted_color === 'red') lossRedCount++;
        else lossBlackCount++;
      }
      
      // Reduce score of color that kept failing
      if (lossRedCount > lossBlackCount) {
        redScore *= 0.6;
        blackScore *= 1.3;
        blackReasons.push(`Recalibração: inversão de estratégia`);
      } else if (lossBlackCount > lossRedCount) {
        blackScore *= 0.6;
        redScore *= 1.3;
        redReasons.push(`Recalibração: inversão de estratégia`);
      }
    }

    // ==================== FINAL PREDICTION ====================
    
    const predictedColor = redScore > blackScore ? 'red' : 'black';
    const scoreDiff = Math.abs(redScore - blackScore);
    const totalScore = redScore + blackScore;
    
    // Calculate confidence based on score differential
    let confidence = 60 + Math.min(35, scoreDiff * 2);
    
    // Adjust confidence based on data quality
    if (matchedLearnedPatterns.length > 0) {
      confidence += 3;
    }
    if (pattern3.total >= 5 || pattern4.total >= 3) {
      confidence += 5;
    }
    if (winRate > 55 && completedSignals.length >= 20) {
      confidence += 3;
    }
    
    confidence = Math.min(95, Math.max(60, confidence));
    
    const winningReasons = predictedColor === 'red' ? redReasons : blackReasons;
    const topReasons = winningReasons.slice(0, 4);

    const prediction = {
      predicted_color: predictedColor,
      confidence: Math.round(confidence),
      reason: topReasons.join(' | ') || 'Análise estatística avançada',
      analysis: `Score: R${redScore.toFixed(1)} vs B${blackScore.toFixed(1)}. Padrões: ${matchedLearnedPatterns.length}. WinRate: ${winRate.toFixed(1)}%`,
      protections: confidence >= 80 ? 2 : confidence >= 70 ? 2 : 3,
      should_bet: confidence >= 65 && scoreDiff >= 5,
      patterns_used: topReasons,
      scores: { red: redScore, black: blackScore }
    };

    console.log('Advanced prediction:', JSON.stringify(prediction, null, 2));

    // Try AI enhancement if available
    let finalPrediction = prediction;
    
    try {
      const aiPrompt = `Analise esta previsão estatística e confirme ou ajuste:
Previsão atual: ${prediction.predicted_color} (${prediction.confidence}%)
Razões: ${topReasons.join(', ')}
Últimas 10 cores: ${last10Colors.join(', ')}
Sequência atual: ${currentStreak.count}x ${currentStreak.color}
Stats 20: R=${last20Stats.red} B=${last20Stats.black}
Score: Vermelho=${redScore.toFixed(1)}, Preto=${blackScore.toFixed(1)}
${recalibrationMode ? 'MODO RECALIBRAÇÃO - considere inverter!' : ''}

Responda APENAS em JSON: {"predicted_color": "red" ou "black", "confidence": 60-95, "reason": "explicação curta", "should_confirm": true/false}`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: 'Você é um analista de padrões. Responda SOMENTE em JSON válido, sem markdown.' },
            { role: 'user', content: aiPrompt }
          ],
        }),
      });

      if (response.ok) {
        const aiData = await response.json();
        const aiResponse = aiData.choices?.[0]?.message?.content;
        
        try {
          let jsonStr = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const aiPrediction = JSON.parse(jsonStr);
          
          // Blend AI with statistical prediction
          if (aiPrediction.should_confirm === false && aiPrediction.predicted_color !== prediction.predicted_color) {
            console.log('AI suggests different color, blending predictions...');
            // If AI strongly disagrees, reduce confidence
            finalPrediction.confidence = Math.max(60, finalPrediction.confidence - 10);
            finalPrediction.reason = `${prediction.reason} | IA: ${aiPrediction.reason}`;
          } else if (aiPrediction.should_confirm) {
            // AI confirms, boost confidence slightly
            finalPrediction.confidence = Math.min(95, finalPrediction.confidence + 5);
          }
        } catch (e) {
          console.log('AI response parse error, using statistical prediction');
        }
      } else {
        console.log('AI not available, using advanced statistical prediction');
      }
    } catch (aiError) {
      console.log('AI enhancement skipped:', aiError);
    }

    // Save patterns for learning
    const currentPatterns = [
      { type: 'sequence_3', key: last20Colors.slice(0, 3).join('-'), data: { lastColors: last20Colors.slice(0, 3) } },
      { type: 'streak', key: `${currentStreak.color}_${currentStreak.count}`, data: currentStreak },
      { type: 'dominance_20', key: `${last20Stats.red > last20Stats.black ? 'red' : 'black'}_${Math.round(Math.max(last20Stats.red, last20Stats.black) / 20 * 100)}`, data: last20Stats }
    ];

    for (const pattern of currentPatterns) {
      try {
        await supabase
          .from('learned_patterns')
          .upsert({
            pattern_type: pattern.type,
            pattern_key: pattern.key,
            pattern_data: {
              ...pattern.data,
              lastPrediction: finalPrediction.predicted_color,
              lastRoundId: roundIdentifiers[0]?.uniqueKey,
              timestamp: new Date().toISOString()
            },
            times_seen: 1,
            times_correct: 0,
            success_rate: 0
          }, {
            onConflict: 'pattern_type,pattern_key',
            ignoreDuplicates: false
          });
      } catch (e) {
        console.error('Error saving pattern:', e);
      }
    }

    const lastRound = recentRounds && recentRounds.length > 0 ? {
      number: recentRounds[0].number,
      color: recentRounds[0].color,
      blaze_id: recentRounds[0].blaze_id,
      uniqueKey: roundIdentifiers[0]?.uniqueKey
    } : null;

    return new Response(JSON.stringify({
      prediction: finalPrediction,
      lastRound,
      currentPatterns: currentPatterns.map(p => ({ type: p.type, key: p.key })),
      stats: {
        last10Stats,
        last20Stats,
        last50Stats,
        currentStreak,
        winRate: winRate.toFixed(1),
        totalSignals: completedSignals.length,
        learnedPatternsCount: (learnedPatterns || []).length,
        matchedPatternsCount: matchedLearnedPatterns.length,
        algorithmScores: { red: redScore, black: blackScore },
        markovProbabilities: markovChain[lastColor] || {},
        streakBreakRate: streakBreakRate,
        alternationRate,
        patterns: { gram3: pattern3, gram4: pattern4 }
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-predict:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
