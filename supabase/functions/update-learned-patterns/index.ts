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
      patterns, 
      roundId,
      wasCorrect 
    } = await req.json();

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    console.log('Learning from prediction result:', {
      predicted: predictedColor,
      actual: actualColor,
      wasCorrect,
      patternsCount: patterns?.length || 0
    });

    // Update each pattern that was used in this prediction
    for (const pattern of (patterns || [])) {
      try {
        // First get current pattern data
        const { data: existingPattern, error: fetchError } = await supabase
          .from('learned_patterns')
          .select('*')
          .eq('pattern_type', pattern.type)
          .eq('pattern_key', pattern.key)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          console.error('Error fetching pattern:', fetchError);
          continue;
        }

        if (existingPattern) {
          // Update existing pattern
          const newTimesSeen = existingPattern.times_seen + 1;
          const newTimesCorrect = existingPattern.times_correct + (wasCorrect ? 1 : 0);
          const newSuccessRate = (newTimesCorrect / newTimesSeen) * 100;

          const updatedData = {
            ...existingPattern.pattern_data,
            lastActualResult: actualColor,
            lastPrediction: predictedColor,
            lastRoundId: roundId,
            lastUpdate: new Date().toISOString(),
            ...(wasCorrect ? { lastSuccessfulPrediction: predictedColor } : {})
          };

          const { error: updateError } = await supabase
            .from('learned_patterns')
            .update({
              times_seen: newTimesSeen,
              times_correct: newTimesCorrect,
              success_rate: newSuccessRate,
              last_result: actualColor,
              pattern_data: updatedData
            })
            .eq('id', existingPattern.id);

          if (updateError) {
            console.error('Error updating pattern:', updateError);
          } else {
            console.log(`Updated pattern ${pattern.type}:${pattern.key} - Success rate: ${newSuccessRate.toFixed(1)}%`);
          }
        } else {
          // Create new pattern
          const { error: insertError } = await supabase
            .from('learned_patterns')
            .insert({
              pattern_type: pattern.type,
              pattern_key: pattern.key,
              pattern_data: {
                ...pattern.data,
                lastActualResult: actualColor,
                lastPrediction: predictedColor,
                lastRoundId: roundId,
                created: new Date().toISOString(),
                ...(wasCorrect ? { lastSuccessfulPrediction: predictedColor } : {})
              },
              times_seen: 1,
              times_correct: wasCorrect ? 1 : 0,
              success_rate: wasCorrect ? 100 : 0,
              last_result: actualColor
            });

          if (insertError) {
            console.error('Error inserting pattern:', insertError);
          } else {
            console.log(`Created new pattern ${pattern.type}:${pattern.key}`);
          }
        }
      } catch (e) {
        console.error('Error processing pattern:', e);
      }
    }

    // Also update prediction_signals with patterns used
    if (roundId) {
      try {
        const { error: signalUpdateError } = await supabase
          .from('prediction_signals')
          .update({
            actual_result: actualColor,
            status: wasCorrect ? 'win' : 'loss'
          })
          .eq('id', roundId);

        if (signalUpdateError) {
          console.error('Error updating signal:', signalUpdateError);
        }
      } catch (e) {
        console.error('Error updating prediction signal:', e);
      }
    }

    // Get updated stats
    const { data: allPatterns } = await supabase
      .from('learned_patterns')
      .select('pattern_type, success_rate, times_seen')
      .order('success_rate', { ascending: false });

    const stats = {
      totalPatterns: allPatterns?.length || 0,
      highSuccessPatterns: allPatterns?.filter(p => p.success_rate >= 60).length || 0,
      averageSuccessRate: allPatterns && allPatterns.length > 0 
        ? allPatterns.reduce((acc, p) => acc + p.success_rate, 0) / allPatterns.length 
        : 0,
      mostReliableTypes: [...new Set(allPatterns?.filter(p => p.success_rate >= 60).map(p => p.pattern_type) || [])]
    };

    return new Response(JSON.stringify({
      success: true,
      patternsUpdated: patterns?.length || 0,
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