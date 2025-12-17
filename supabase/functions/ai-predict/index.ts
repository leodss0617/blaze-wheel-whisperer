import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RoundData {
  blaze_id: string;
  color: string;
  number: number;
  round_timestamp: string;
}

// Blaze Double has 15 numbers (0-14), each appearing twice = 30 positions
const NUMBER_TO_COLOR: Record<number, string> = {
  0: 'white',
  1: 'red', 2: 'black', 3: 'red', 4: 'black',
  5: 'red', 6: 'black', 7: 'red', 8: 'black',
  9: 'red', 10: 'black', 11: 'red', 12: 'black',
  13: 'red', 14: 'black'
};

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

    // Current time in Brasília
    const now = new Date();
    const brasiliaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const currentHour = brasiliaTime.getHours();
    const currentMinute = brasiliaTime.getMinutes();
    const currentSecond = brasiliaTime.getSeconds();
    
    console.log(`AI Predict - Brasília: ${currentHour}:${currentMinute}:${currentSecond} | Recalibration: ${recalibrationMode}`);

    // Fetch recent rounds - 200 for comprehensive analysis
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

    // Fetch past signals for performance analysis
    const { data: pastSignals, error: signalsError } = await supabase
      .from('prediction_signals')
      .select('*')
      .order('signal_timestamp', { ascending: false })
      .limit(200);

    if (signalsError) {
      console.error('Error fetching signals:', signalsError);
    }

    const rounds = (recentRounds || []) as RoundData[];
    
    // Extract data arrays
    const last30 = rounds.slice(0, 30);  // One complete cycle
    const last60 = rounds.slice(0, 60);  // Two cycles
    const last100 = rounds.slice(0, 100);
    
    const colors30 = last30.map(r => r.color);
    const colors60 = last60.map(r => r.color);
    const colors100 = last100.map(r => r.color);
    
    const numbers30 = last30.map(r => r.number);
    const numbers60 = last60.map(r => r.number);

    // ==================== PREDICTION SCORES ====================
    let redScore = 0;
    let blackScore = 0;
    const redReasons: string[] = [];
    const blackReasons: string[] = [];

    // ==================== 1. TIME-BASED ANALYSIS ====================
    // Different hours/minutes may have different patterns
    const analyzeTimePatterns = () => {
      const hourRounds = rounds.filter(r => {
        const roundTime = new Date(r.round_timestamp);
        return roundTime.getHours() === currentHour;
      }).slice(0, 50);

      if (hourRounds.length >= 20) {
        const hourColors = hourRounds.map(r => r.color);
        const redCount = hourColors.filter(c => c === 'red').length;
        const blackCount = hourColors.filter(c => c === 'black').length;
        const total = redCount + blackCount;
        
        if (total > 0) {
          const redPct = redCount / total;
          if (redPct > 0.55) {
            return { bias: 'red', strength: (redPct - 0.5) * 40 };
          } else if (redPct < 0.45) {
            return { bias: 'black', strength: (0.5 - redPct) * 40 };
          }
        }
      }
      
      return { bias: null, strength: 0 };
    };

    const timeBias = analyzeTimePatterns();
    if (timeBias.bias === 'red') {
      redScore += timeBias.strength;
      redReasons.push(`Horário ${currentHour}h favorece vermelho`);
    } else if (timeBias.bias === 'black') {
      blackScore += timeBias.strength;
      blackReasons.push(`Horário ${currentHour}h favorece preto`);
    }

    // Minute patterns (some minutes may have tendencies)
    const minuteBlock = Math.floor(currentMinute / 10); // 0-5 blocks
    const minuteRounds = rounds.filter(r => {
      const roundTime = new Date(r.round_timestamp);
      return Math.floor(roundTime.getMinutes() / 10) === minuteBlock;
    }).slice(0, 30);

    if (minuteRounds.length >= 15) {
      const colors = minuteRounds.map(r => r.color);
      const redPct = colors.filter(c => c === 'red').length / colors.filter(c => c !== 'white').length;
      
      if (redPct > 0.58) {
        redScore += 8;
        redReasons.push(`Minutos ${minuteBlock * 10}-${minuteBlock * 10 + 9} favorecem vermelho`);
      } else if (redPct < 0.42) {
        blackScore += 8;
        blackReasons.push(`Minutos ${minuteBlock * 10}-${minuteBlock * 10 + 9} favorecem preto`);
      }
    }

    // ==================== 2. NUMBER SEQUENCE ANALYSIS ====================
    // Analyze patterns in the actual numbers (0-14)
    const analyzeNumberSequences = () => {
      const lastNum = numbers30[0];
      const last3Nums = numbers30.slice(0, 3);
      const last5Nums = numbers30.slice(0, 5);
      
      // Find what typically follows specific numbers
      const numberFollowers: Record<number, { red: number; black: number }> = {};
      
      for (let n = 0; n <= 14; n++) {
        numberFollowers[n] = { red: 0, black: 0 };
      }
      
      for (let i = 0; i < numbers60.length - 1; i++) {
        const num = numbers60[i];
        const nextColor = colors60[i + 1];
        if (nextColor === 'red') numberFollowers[num].red++;
        else if (nextColor === 'black') numberFollowers[num].black++;
      }
      
      // What typically follows the last number?
      if (lastNum !== undefined) {
        const follower = numberFollowers[lastNum];
        const total = follower.red + follower.black;
        
        if (total >= 5) {
          const redPct = follower.red / total;
          if (redPct > 0.6) {
            return { bias: 'red', strength: (redPct - 0.5) * 30, reason: `Após número ${lastNum}` };
          } else if (redPct < 0.4) {
            return { bias: 'black', strength: (0.5 - redPct) * 30, reason: `Após número ${lastNum}` };
          }
        }
      }
      
      return { bias: null, strength: 0, reason: '' };
    };

    const numberSeq = analyzeNumberSequences();
    if (numberSeq.bias === 'red') {
      redScore += numberSeq.strength;
      redReasons.push(numberSeq.reason);
    } else if (numberSeq.bias === 'black') {
      blackScore += numberSeq.strength;
      blackReasons.push(numberSeq.reason);
    }

    // ==================== 3. 30-ROUND CYCLE ANALYSIS ====================
    // Each complete cycle has all 15 numbers appearing twice
    const analyzeCyclePosition = () => {
      // Count number appearances in current cycle
      const numberCounts: Record<number, number> = {};
      for (let n = 0; n <= 14; n++) numberCounts[n] = 0;
      
      for (const num of numbers30) {
        numberCounts[num]++;
      }
      
      // Find numbers that haven't appeared or appeared only once
      const missingOnce: number[] = [];
      const missingCompletely: number[] = [];
      
      for (let n = 0; n <= 14; n++) {
        if (numberCounts[n] === 0) missingCompletely.push(n);
        else if (numberCounts[n] === 1) missingOnce.push(n);
      }
      
      // Calculate color bias from missing numbers
      let redMissing = 0;
      let blackMissing = 0;
      
      for (const n of missingCompletely) {
        if (NUMBER_TO_COLOR[n] === 'red') redMissing += 2;
        else if (NUMBER_TO_COLOR[n] === 'black') blackMissing += 2;
      }
      
      for (const n of missingOnce) {
        if (NUMBER_TO_COLOR[n] === 'red') redMissing += 1;
        else if (NUMBER_TO_COLOR[n] === 'black') blackMissing += 1;
      }
      
      return { redMissing, blackMissing, missingCompletely, missingOnce };
    };

    const cycleAnalysis = analyzeCyclePosition();
    
    if (cycleAnalysis.redMissing > cycleAnalysis.blackMissing + 3) {
      redScore += (cycleAnalysis.redMissing - cycleAnalysis.blackMissing) * 2;
      redReasons.push(`Ciclo: ${cycleAnalysis.missingCompletely.filter(n => NUMBER_TO_COLOR[n] === 'red').length} nums vermelhos faltando`);
    } else if (cycleAnalysis.blackMissing > cycleAnalysis.redMissing + 3) {
      blackScore += (cycleAnalysis.blackMissing - cycleAnalysis.redMissing) * 2;
      blackReasons.push(`Ciclo: ${cycleAnalysis.missingCompletely.filter(n => NUMBER_TO_COLOR[n] === 'black').length} nums pretos faltando`);
    }

    // ==================== 4. STREAK ANALYSIS (with Gale consideration) ====================
    const analyzeStreaks = () => {
      let currentStreak = { color: colors30[0], count: 0 };
      
      // Count ALL same-color rounds (including gales)
      for (const color of colors30) {
        if (color === 'white') continue;
        if (color === currentStreak.color) {
          currentStreak.count++;
        } else if (currentStreak.count === 0) {
          currentStreak.color = color;
          currentStreak.count = 1;
        } else {
          break;
        }
      }
      
      return currentStreak;
    };

    const currentStreak = analyzeStreaks();
    
    // Historical streak break analysis
    const analyzeStreakBreaks = () => {
      let breaksAfter2 = { broken: 0, continued: 0 };
      let breaksAfter3 = { broken: 0, continued: 0 };
      let breaksAfter4 = { broken: 0, continued: 0 };
      
      let streak = 1;
      let streakColor = colors100[0];
      
      for (let i = 1; i < colors100.length; i++) {
        if (colors100[i] === 'white') continue;
        
        if (colors100[i] === streakColor) {
          streak++;
        } else {
          // Record break point
          if (streak === 2) breaksAfter2.broken++;
          else if (streak === 3) breaksAfter3.broken++;
          else if (streak >= 4) breaksAfter4.broken++;
          
          streakColor = colors100[i];
          streak = 1;
        }
        
        // Record continuation
        if (streak === 3 && colors100[i - 1] === streakColor) breaksAfter2.continued++;
        if (streak === 4 && colors100[i - 1] === streakColor) breaksAfter3.continued++;
        if (streak === 5 && colors100[i - 1] === streakColor) breaksAfter4.continued++;
      }
      
      return { breaksAfter2, breaksAfter3, breaksAfter4 };
    };

    const streakHistory = analyzeStreakBreaks();
    
    if (currentStreak.count >= 2 && currentStreak.color !== 'white') {
      const opposite = currentStreak.color === 'red' ? 'black' : 'red';
      let breakProb = 0.5;
      
      if (currentStreak.count === 2) {
        const total = streakHistory.breaksAfter2.broken + streakHistory.breaksAfter2.continued;
        if (total > 5) breakProb = streakHistory.breaksAfter2.broken / total;
      } else if (currentStreak.count === 3) {
        const total = streakHistory.breaksAfter3.broken + streakHistory.breaksAfter3.continued;
        if (total > 3) breakProb = streakHistory.breaksAfter3.broken / total;
      } else if (currentStreak.count >= 4) {
        const total = streakHistory.breaksAfter4.broken + streakHistory.breaksAfter4.continued;
        if (total > 2) breakProb = streakHistory.breaksAfter4.broken / total;
      }
      
      const streakWeight = currentStreak.count * breakProb * 8;
      
      if (opposite === 'red') {
        redScore += streakWeight;
        redReasons.push(`Sequência ${currentStreak.count}x ${currentStreak.color} (${(breakProb * 100).toFixed(0)}% quebra)`);
      } else {
        blackScore += streakWeight;
        blackReasons.push(`Sequência ${currentStreak.count}x ${currentStreak.color} (${(breakProb * 100).toFixed(0)}% quebra)`);
      }
    }

    // ==================== 5. PATTERN SIZE ANALYSIS ====================
    // Detect and analyze various pattern sizes
    const analyzePatternSizes = () => {
      const patterns: { pattern: string; nextRed: number; nextBlack: number }[] = [];
      
      // 2-gram patterns
      for (let i = 2; i < colors60.length - 1; i++) {
        const p = colors60.slice(i, i + 2).join('-');
        const next = colors60[i - 1];
        if (next !== 'white') {
          const existing = patterns.find(x => x.pattern === p);
          if (existing) {
            if (next === 'red') existing.nextRed++;
            else existing.nextBlack++;
          } else {
            patterns.push({ pattern: p, nextRed: next === 'red' ? 1 : 0, nextBlack: next === 'black' ? 1 : 0 });
          }
        }
      }
      
      // 3-gram patterns
      for (let i = 3; i < colors60.length - 1; i++) {
        const p = colors60.slice(i, i + 3).join('-');
        const next = colors60[i - 1];
        if (next !== 'white') {
          const existing = patterns.find(x => x.pattern === p);
          if (existing) {
            if (next === 'red') existing.nextRed++;
            else existing.nextBlack++;
          } else {
            patterns.push({ pattern: p, nextRed: next === 'red' ? 1 : 0, nextBlack: next === 'black' ? 1 : 0 });
          }
        }
      }
      
      return patterns;
    };

    const allPatterns = analyzePatternSizes();
    
    // Check current 2-gram and 3-gram
    const current2gram = colors30.slice(0, 2).join('-');
    const current3gram = colors30.slice(0, 3).join('-');
    
    for (const p of allPatterns) {
      if (p.pattern === current2gram || p.pattern === current3gram) {
        const total = p.nextRed + p.nextBlack;
        if (total >= 3) {
          const redProb = p.nextRed / total;
          const weight = p.pattern.split('-').length === 2 ? 10 : 15; // 3-gram has more weight
          
          if (redProb > 0.6) {
            redScore += (redProb - 0.5) * weight * 2;
            redReasons.push(`Padrão ${p.pattern}: ${(redProb * 100).toFixed(0)}% vermelho`);
          } else if (redProb < 0.4) {
            blackScore += (0.5 - redProb) * weight * 2;
            blackReasons.push(`Padrão ${p.pattern}: ${((1 - redProb) * 100).toFixed(0)}% preto`);
          }
        }
      }
    }

    // ==================== 6. MARKOV CHAIN ANALYSIS ====================
    const buildMarkovChain = () => {
      const transitions: Record<string, Record<string, number>> = {
        red: { red: 0, black: 0 },
        black: { red: 0, black: 0 },
        white: { red: 0, black: 0 }
      };
      
      for (let i = 0; i < colors100.length - 1; i++) {
        const current = colors100[i];
        const next = colors100[i + 1];
        if (next !== 'white' && transitions[current]) {
          transitions[current][next]++;
        }
      }
      
      return transitions;
    };

    const markov = buildMarkovChain();
    const lastColor = colors30[0];
    
    if (lastColor && lastColor !== 'white' && markov[lastColor]) {
      const total = markov[lastColor].red + markov[lastColor].black;
      if (total > 10) {
        const redProb = markov[lastColor].red / total;
        
        if (redProb > 0.55) {
          redScore += (redProb - 0.5) * 25;
          redReasons.push(`Markov: ${(redProb * 100).toFixed(0)}% vermelho após ${lastColor}`);
        } else if (redProb < 0.45) {
          blackScore += (0.5 - redProb) * 25;
          blackReasons.push(`Markov: ${((1 - redProb) * 100).toFixed(0)}% preto após ${lastColor}`);
        }
      }
    }

    // ==================== 7. GAP ANALYSIS ====================
    const calculateGaps = () => {
      let redGap = 0;
      let blackGap = 0;
      
      for (const c of colors30) {
        if (c === 'red') break;
        if (c !== 'white') redGap++;
      }
      
      for (const c of colors30) {
        if (c === 'black') break;
        if (c !== 'white') blackGap++;
      }
      
      // Average gaps
      const calcAvgGap = (targetColor: string) => {
        const gaps: number[] = [];
        let gap = 0;
        
        for (const c of colors100) {
          if (c === targetColor) {
            if (gap > 0) gaps.push(gap);
            gap = 0;
          } else if (c !== 'white') {
            gap++;
          }
        }
        
        return gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 3;
      };
      
      return {
        redGap,
        blackGap,
        avgRedGap: calcAvgGap('red'),
        avgBlackGap: calcAvgGap('black')
      };
    };

    const gaps = calculateGaps();
    
    if (gaps.redGap > gaps.avgRedGap * 1.8) {
      redScore += Math.min(20, (gaps.redGap - gaps.avgRedGap) * 4);
      redReasons.push(`Gap vermelho: ${gaps.redGap} (média ${gaps.avgRedGap.toFixed(1)})`);
    }
    
    if (gaps.blackGap > gaps.avgBlackGap * 1.8) {
      blackScore += Math.min(20, (gaps.blackGap - gaps.avgBlackGap) * 4);
      blackReasons.push(`Gap preto: ${gaps.blackGap} (média ${gaps.avgBlackGap.toFixed(1)})`);
    }

    // ==================== 8. EQUILIBRIUM ANALYSIS ====================
    const countColors = (colors: string[]) => {
      const red = colors.filter(c => c === 'red').length;
      const black = colors.filter(c => c === 'black').length;
      const white = colors.filter(c => c === 'white').length;
      return { red, black, white };
    };

    const stats30 = countColors(colors30);
    const stats60 = countColors(colors60);
    
    // In a balanced game, red and black should be roughly equal
    const total30 = stats30.red + stats30.black;
    if (total30 > 20) {
      const redPct30 = stats30.red / total30;
      
      if (redPct30 < 0.4) {
        redScore += (0.5 - redPct30) * 25;
        redReasons.push(`Equilíbrio: vermelho ${(redPct30 * 100).toFixed(0)}% em 30 rodadas`);
      } else if (redPct30 > 0.6) {
        blackScore += (redPct30 - 0.5) * 25;
        blackReasons.push(`Equilíbrio: preto ${((1 - redPct30) * 100).toFixed(0)}% em 30 rodadas`);
      }
    }

    // ==================== 9. LEARNED PATTERNS ====================
    const matchedPatterns = (learnedPatterns || []).filter(lp => {
      if (lp.pattern_type === 'sequence_3') {
        const seq = colors30.slice(0, 3).join('-');
        return lp.pattern_key === `sequence_3:${seq}`;
      }
      if (lp.pattern_type === 'streak') {
        return lp.pattern_key === `streak:${currentStreak.color}_${currentStreak.count}`;
      }
      if (lp.pattern_type === 'dominance_20') {
        const dominant = stats30.red > stats30.black ? 'red' : 'black';
        const pct = Math.round((Math.max(stats30.red, stats30.black) / (stats30.red + stats30.black)) * 100);
        return lp.pattern_key === `dominance_20:${dominant}_${pct}`;
      }
      return false;
    });

    for (const pattern of matchedPatterns) {
      if (pattern.times_seen >= 5 && pattern.success_rate > 55) {
        const weight = (pattern.success_rate / 100) * Math.min(5, Math.log(pattern.times_seen + 1)) * 4;
        const data = pattern.pattern_data as any;
        
        if (data?.lastSuccessfulPrediction === 'red') {
          redScore += weight;
          redReasons.push(`Aprendido: ${pattern.pattern_key.split(':')[0]} (${pattern.success_rate.toFixed(0)}%)`);
        } else if (data?.lastSuccessfulPrediction === 'black') {
          blackScore += weight;
          blackReasons.push(`Aprendido: ${pattern.pattern_key.split(':')[0]} (${pattern.success_rate.toFixed(0)}%)`);
        }
      }
    }

    // ==================== 10. RECALIBRATION MODE ====================
    if (recalibrationMode) {
      console.log('Applying recalibration...');
      
      const recentLosses = (pastSignals || [])
        .filter(s => s.status === 'loss')
        .slice(0, 3);
      
      let lossRed = recentLosses.filter(l => l.predicted_color === 'red').length;
      let lossBlack = recentLosses.filter(l => l.predicted_color === 'black').length;
      
      if (lossRed > lossBlack) {
        redScore *= 0.5;
        blackScore *= 1.4;
        blackReasons.push('Recalibração: inversão estratégica');
      } else if (lossBlack > lossRed) {
        blackScore *= 0.5;
        redScore *= 1.4;
        redReasons.push('Recalibração: inversão estratégica');
      }
    }

    // ==================== FINAL PREDICTION ====================
    const predictedColor = redScore > blackScore ? 'red' : 'black';
    const scoreDiff = Math.abs(redScore - blackScore);
    const totalScore = redScore + blackScore;
    
    // Calculate confidence based on score difference
    let confidence = 50;
    if (totalScore > 0) {
      confidence = Math.min(95, 50 + (scoreDiff / totalScore) * 50);
    }
    
    // Minimum confidence threshold
    if (scoreDiff < 5) {
      confidence = Math.max(45, confidence - 15);
    }

    const winningReasons = predictedColor === 'red' ? redReasons : blackReasons;
    const reasonStr = winningReasons.slice(0, 4).join('; ');

    console.log(`Prediction: ${predictedColor} | Confidence: ${confidence.toFixed(1)}%`);
    console.log(`Red Score: ${redScore.toFixed(1)} | Black Score: ${blackScore.toFixed(1)}`);
    console.log(`Reasons: ${reasonStr}`);

    // Save prediction to database
    const { data: savedSignal, error: saveError } = await supabase
      .from('prediction_signals')
      .insert({
        predicted_color: predictedColor,
        confidence: Math.round(confidence),
        reason: reasonStr || 'Análise multi-fator',
        protections: 2,
        signal_timestamp: new Date().toISOString(),
        status: 'pending'
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving signal:', saveError);
    }

    const response = {
      success: true,
      prediction: {
        id: savedSignal?.id || `pred_${Date.now()}`,
        predictedColor,
        confidence: Math.round(confidence),
        reason: reasonStr || 'Análise multi-fator',
        protections: 2,
        timestamp: new Date(),
        analysis: {
          time: { hour: currentHour, minute: currentMinute },
          streak: currentStreak,
          cycle: cycleAnalysis,
          gaps,
          scores: { red: redScore.toFixed(1), black: blackScore.toFixed(1) }
        }
      }
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('AI Predict Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Prediction failed' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
