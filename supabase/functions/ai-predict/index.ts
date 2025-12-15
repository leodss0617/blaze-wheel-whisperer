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
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Fetch recent rounds from database
    const { data: recentRounds, error: roundsError } = await supabase
      .from('blaze_rounds')
      .select('*')
      .order('round_timestamp', { ascending: false })
      .limit(100);

    if (roundsError) {
      console.error('Error fetching rounds:', roundsError);
      throw roundsError;
    }

    // Fetch recent signals with their outcomes
    const { data: pastSignals, error: signalsError } = await supabase
      .from('prediction_signals')
      .select('*')
      .order('signal_timestamp', { ascending: false })
      .limit(50);

    if (signalsError) {
      console.error('Error fetching signals:', signalsError);
      throw signalsError;
    }

    // Calculate performance metrics
    const completedSignals = pastSignals?.filter(s => s.status !== 'pending') || [];
    const wins = completedSignals.filter(s => s.status === 'win').length;
    const losses = completedSignals.filter(s => s.status === 'loss').length;
    const winRate = completedSignals.length > 0 ? (wins / completedSignals.length * 100).toFixed(1) : 0;

    // Analyze patterns
    const last20Colors = recentRounds?.slice(0, 20).map(r => r.color) || [];
    const last50Colors = recentRounds?.slice(0, 50).map(r => r.color) || [];
    
    // Count color frequencies
    const countColors = (colors: string[]) => ({
      red: colors.filter(c => c === 'red').length,
      black: colors.filter(c => c === 'black').length,
      white: colors.filter(c => c === 'white').length,
    });

    const last20Stats = countColors(last20Colors);
    const last50Stats = countColors(last50Colors);

    // Find streaks and patterns
    let currentStreak = { color: last20Colors[0], count: 1 };
    for (let i = 1; i < last20Colors.length; i++) {
      if (last20Colors[i] === currentStreak.color) {
        currentStreak.count++;
      } else {
        break;
      }
    }

    // Analyze what worked and what didn't
    const successfulPatterns = completedSignals
      .filter(s => s.status === 'win')
      .map(s => s.reason);
    
    const failedPatterns = completedSignals
      .filter(s => s.status === 'loss')
      .map(s => ({ reason: s.reason, predicted: s.predicted_color, actual: s.actual_result }));

    // Build AI prompt with historical context
    const prompt = `Você é um especialista em análise de padrões do jogo Double da Blaze. 
Analise os dados históricos e faça uma previsão precisa.

DADOS ATUAIS:
- Últimas 20 cores: ${last20Colors.join(', ')}
- Sequência atual: ${currentStreak.count}x ${currentStreak.color}
- Últimas 20 rodadas: Vermelho=${last20Stats.red}, Preto=${last20Stats.black}, Branco=${last20Stats.white}
- Últimas 50 rodadas: Vermelho=${last50Stats.red}, Preto=${last50Stats.black}, Branco=${last50Stats.white}

HISTÓRICO DE PERFORMANCE:
- Total de sinais: ${completedSignals.length}
- Taxa de acerto: ${winRate}%
- Vitórias: ${wins}, Derrotas: ${losses}

PADRÕES QUE FUNCIONARAM:
${successfulPatterns.slice(0, 5).map(p => `- ${p}`).join('\n') || '- Ainda coletando dados'}

PADRÕES QUE FALHARAM:
${failedPatterns.slice(0, 5).map(p => `- ${p.reason} (previu ${p.predicted}, saiu ${p.actual})`).join('\n') || '- Ainda coletando dados'}

REGRAS:
1. Analise a sequência atual e probabilidades
2. Considere os padrões que funcionaram e evite os que falharam
3. Seja conservador - só dê previsão com alta confiança
4. Nunca preveja branco (probabilidade muito baixa)

Responda APENAS em JSON válido com este formato:
{
  "predicted_color": "red" ou "black",
  "confidence": número de 60 a 95,
  "reason": "explicação curta em português",
  "analysis": "análise detalhada",
  "protections": número de 1 a 3,
  "should_bet": true ou false
}`;

    console.log('Calling AI for prediction...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Você é um analista de padrões especializado. Sempre responda em JSON válido.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required. Add credits to continue.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const aiResponse = aiData.choices?.[0]?.message?.content;

    console.log('AI Response:', aiResponse);

    // Parse AI response
    let prediction;
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = aiResponse;
      const jsonMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      prediction = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Fallback prediction based on statistics
      prediction = {
        predicted_color: last20Stats.red > last20Stats.black ? 'black' : 'red',
        confidence: 65,
        reason: 'Análise estatística básica',
        analysis: 'IA não disponível, usando análise estatística',
        protections: 2,
        should_bet: true,
      };
    }

    return new Response(JSON.stringify({
      prediction,
      stats: {
        last20Stats,
        last50Stats,
        currentStreak,
        winRate,
        totalSignals: completedSignals.length,
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
