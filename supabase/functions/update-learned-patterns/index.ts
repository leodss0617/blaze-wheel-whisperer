import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      predictedColor, 
      actualColor, 
      patterns = [], 
      roundId,
      wasCorrect,
      recentColors = []
    } = await req.json();

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    console.log('Learning from prediction result:', {
      predicted: predictedColor,
      actual: actualColor,
      wasCorrect,
      patternsCount: patterns?.length || 0,
      recentColorsCount: recentColors?.length || 0
    });

    // Auto-extract patterns from recent colors
    const autoPatterns: { type: string; key: string; data: any }[] = [];
    
    if (recentColors && recentColors.length >= 3) {
      // 2-gram pattern
      const gram2 = recentColors.slice(1, 3).join('-');
      autoPatterns.push({
        type: 'sequence_2',
        key: `sequence_2:${gram2}`,
        data: { sequence: gram2, nextColor: actualColor }
      });
      
      // 3-gram pattern
      if (recentColors.length >= 4) {
        const gram3 = recentColors.slice(1, 4).join('-');
        autoPatterns.push({
          type: 'sequence_3',
          key: `sequence_3:${gram3}`,
          data: { sequence: gram3, nextColor: actualColor }
        });
      }
      
      // 4-gram pattern for higher accuracy
      if (recentColors.length >= 5) {
        const gram4 = recentColors.slice(1, 5).join('-');
        autoPatterns.push({
          type: 'sequence_4',
          key: `sequence_4:${gram4}`,
          data: { sequence: gram4, nextColor: actualColor }
        });
      }
      
      // Streak pattern
      let streakColor = recentColors[1];
      let streakCount = 0;
      for (const c of recentColors.slice(1)) {
        if (c === 'white') continue;
        if (c === streakColor) streakCount++;
        else break;
      }
      if (streakCount >= 2) {
        autoPatterns.push({
          type: 'streak',
          key: `streak:${streakColor}_${streakCount}`,
          data: { streakColor, streakCount, nextColor: actualColor }
        });
      }
      
      // Gap pattern
      const nonWhite = recentColors.slice(1).filter((c: string) => c !== 'white');
      const redGap = nonWhite.indexOf('red');
      const blackGap = nonWhite.indexOf('black');
      
      if (redGap >= 2) {
        autoPatterns.push({
          type: 'gap',
          key: `gap:red_${redGap}`,
          data: { color: 'red', gap: redGap, nextColor: actualColor }
        });
      }
      if (blackGap >= 2) {
        autoPatterns.push({
          type: 'gap',
          key: `gap:black_${blackGap}`,
          data: { color: 'black', gap: blackGap, nextColor: actualColor }
        });
      }
      
      // Alternation pattern
      let alternations = 0;
      for (let i = 1; i < Math.min(6, nonWhite.length); i++) {
        if (nonWhite[i] !== nonWhite[i - 1]) alternations++;
      }
      if (alternations >= 3) {
        autoPatterns.push({
          type: 'alternation',
          key: `alternation:${alternations}`,
          data: { alternations, nextColor: actualColor }
        });
      }
    }

    // Combine manual patterns with auto-extracted ones
    const allPatterns = [...patterns, ...autoPatterns];

    // Update each pattern
    for (const pattern of allPatterns) {
      try {
        const { data: existingPattern, error: fetchError } = await supabase
          .from('learned_patterns')
          .select('*')
          .eq('pattern_type', pattern.type)
          .eq('pattern_key', pattern.key)
          .maybeSingle();

        if (fetchError) {
          console.error('Error fetching pattern:', fetchError);
          continue;
        }

        // Determine if this pattern predicted correctly
        const patternData = pattern.data || {};
        const patternPredictedCorrectly = patternData.nextColor === actualColor || wasCorrect;

        if (existingPattern) {
          const newTimesSeen = existingPattern.times_seen + 1;
          const newTimesCorrect = existingPattern.times_correct + (patternPredictedCorrectly ? 1 : 0);
          const newSuccessRate = (newTimesCorrect / newTimesSeen) * 100;

          const updatedData = {
            ...existingPattern.pattern_data,
            lastActualResult: actualColor,
            lastPrediction: predictedColor,
            lastRoundId: roundId,
            lastUpdate: new Date().toISOString(),
            ...(patternPredictedCorrectly ? { lastSuccessfulPrediction: actualColor } : {})
          };

          await supabase
            .from('learned_patterns')
            .update({
              times_seen: newTimesSeen,
              times_correct: newTimesCorrect,
              success_rate: newSuccessRate,
              last_result: actualColor,
              pattern_data: updatedData
            })
            .eq('id', existingPattern.id);

          console.log(`Updated ${pattern.type}:${pattern.key} - ${newSuccessRate.toFixed(1)}% (${newTimesCorrect}/${newTimesSeen})`);
        } else {
          await supabase
            .from('learned_patterns')
            .insert({
              pattern_type: pattern.type,
              pattern_key: pattern.key,
              pattern_data: {
                ...patternData,
                lastActualResult: actualColor,
                lastPrediction: predictedColor,
                lastRoundId: roundId,
                created: new Date().toISOString(),
                ...(patternPredictedCorrectly ? { lastSuccessfulPrediction: actualColor } : {})
              },
              times_seen: 1,
              times_correct: patternPredictedCorrectly ? 1 : 0,
              success_rate: patternPredictedCorrectly ? 100 : 0,
              last_result: actualColor
            });

          console.log(`Created ${pattern.type}:${pattern.key}`);
        }
      } catch (e) {
        console.error('Error processing pattern:', e);
      }
    }

    // Update prediction signal
    if (roundId) {
      try {
        await supabase
          .from('prediction_signals')
          .update({
            actual_result: actualColor,
            status: wasCorrect ? 'win' : 'loss'
          })
          .eq('id', roundId);
      } catch (e) {
        console.error('Error updating prediction signal:', e);
      }
    }

    // Clean up low-performing patterns (prune after 10+ observations with <40% success)
    const { data: lowPerformers } = await supabase
      .from('learned_patterns')
      .select('id')
      .lt('success_rate', 40)
      .gte('times_seen', 10);

    if (lowPerformers && lowPerformers.length > 0) {
      const idsToDelete = lowPerformers.map(p => p.id);
      await supabase
        .from('learned_patterns')
        .delete()
        .in('id', idsToDelete);
      console.log(`Pruned ${idsToDelete.length} low-performing patterns`);
    }

    // Get updated stats
    const { data: allStoredPatterns } = await supabase
      .from('learned_patterns')
      .select('pattern_type, success_rate, times_seen')
      .order('success_rate', { ascending: false });

    const stats = {
      totalPatterns: allStoredPatterns?.length || 0,
      highSuccessPatterns: allStoredPatterns?.filter(p => p.success_rate >= 55).length || 0,
      averageSuccessRate: allStoredPatterns && allStoredPatterns.length > 0 
        ? allStoredPatterns.reduce((acc, p) => acc + p.success_rate, 0) / allStoredPatterns.length 
        : 0,
      mostReliableTypes: [...new Set(allStoredPatterns?.filter(p => p.success_rate >= 60 && p.times_seen >= 3).map(p => p.pattern_type) || [])]
    };

    console.log('Learning stats:', stats);

    return new Response(JSON.stringify({
      success: true,
      patternsUpdated: allPatterns.length,
      autoExtracted: autoPatterns.length,
      stats
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-learned-patterns:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});