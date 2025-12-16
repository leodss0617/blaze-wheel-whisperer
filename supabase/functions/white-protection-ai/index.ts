import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { recentColors, recentNumbers, stats, currentBetAmount } = await req.json();
    
    console.log('White Protection AI - Analyzing:', {
      colorsCount: recentColors?.length,
      roundsSinceLastWhite: stats?.roundsSinceLastWhite,
      averageGap: stats?.averageGap,
    });

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Build analysis prompt
    const colorSequence = recentColors.slice(-30).join(', ');
    const numberSequence = recentNumbers.slice(-30).join(', ');
    
    const systemPrompt = `Você é uma IA especialista em análise estatística do jogo Blaze Double.
Sua função é analisar padrões e recomendar quando fazer proteção no BRANCO.

O branco aparece quando sai o número 0, com probabilidade teórica de ~7% (1 em 14).
Branco paga 14x o valor apostado.

Análise estatística atual:
- Rodadas sem branco: ${stats.roundsSinceLastWhite}
- Média histórica entre brancos: ${stats.averageGap.toFixed(1)} rodadas
- Gap máximo já registrado: ${stats.maxGap || 'N/A'} rodadas
- Percentual de brancos: ${stats.whitePercentage.toFixed(2)}%

REGRAS DE ANÁLISE:
1. Se roundsSinceLastWhite >= 25: ALTA recomendação (confiança 75-90%)
2. Se roundsSinceLastWhite >= 18: MÉDIA recomendação (confiança 55-74%)
3. Se roundsSinceLastWhite >= 12 E abaixo da média: BAIXA recomendação (confiança 40-54%)
4. Caso contrário: SEM recomendação

IMPORTANTE: Seja conservador. Só recomende proteção quando realmente houver boas chances.`;

    const userPrompt = `Analise a sequência de cores e números abaixo e decida se devo proteger no branco.

Últimas 30 cores: ${colorSequence}
Últimos 30 números: ${numberSequence}

Rodadas sem branco: ${stats.roundsSinceLastWhite}
Média entre brancos: ${stats.averageGap.toFixed(1)}

Responda APENAS com um JSON válido no formato:
{
  "shouldProtect": boolean,
  "confidence": number (0-100),
  "reason": "string explicando a análise em português",
  "suggestedAmount": number (porcentagem da aposta, 0-20)
}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      // Return rule-based fallback
      return new Response(JSON.stringify(generateFallbackAnalysis(stats)), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('AI Response:', content);

    // Parse JSON from response
    let result;
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      result = generateFallbackAnalysis(stats);
    }

    // Validate and sanitize result
    const sanitizedResult = {
      shouldProtect: Boolean(result.shouldProtect),
      confidence: Math.min(100, Math.max(0, Number(result.confidence) || 50)),
      reason: String(result.reason || 'Análise concluída'),
      suggestedAmount: Math.min(20, Math.max(0, Number(result.suggestedAmount) || 0)),
    };

    console.log('White Protection Result:', sanitizedResult);

    return new Response(JSON.stringify(sanitizedResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('White Protection AI error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage,
      shouldProtect: false,
      confidence: 0,
      reason: 'Erro na análise',
      suggestedAmount: 0,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function generateFallbackAnalysis(stats: { roundsSinceLastWhite: number; averageGap: number; whitePercentage: number }) {
  const { roundsSinceLastWhite, averageGap } = stats;
  
  if (roundsSinceLastWhite >= 25) {
    return {
      shouldProtect: true,
      confidence: Math.min(90, 65 + (roundsSinceLastWhite - 25) * 2),
      reason: `${roundsSinceLastWhite} rodadas sem branco - estatisticamente muito atrasado`,
      suggestedAmount: 15,
    };
  }
  
  if (roundsSinceLastWhite >= 18) {
    return {
      shouldProtect: true,
      confidence: 55 + Math.min(20, roundsSinceLastWhite - 18),
      reason: `${roundsSinceLastWhite} rodadas sem branco - acima da média de ${averageGap.toFixed(0)}`,
      suggestedAmount: 10,
    };
  }
  
  if (roundsSinceLastWhite >= 12 && averageGap <= 12) {
    return {
      shouldProtect: true,
      confidence: 45,
      reason: `Padrão sugere branco próximo (média: ${averageGap.toFixed(0)} rodadas)`,
      suggestedAmount: 7,
    };
  }
  
  return {
    shouldProtect: false,
    confidence: 30,
    reason: `${roundsSinceLastWhite} rodadas sem branco - dentro do esperado`,
    suggestedAmount: 0,
  };
}
