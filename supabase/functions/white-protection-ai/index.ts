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
    const { recentColors, recentNumbers, stats, currentBetAmount } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    console.log('White Protection AI - Analyzing:', {
      colorsCount: recentColors?.length,
      roundsSinceLastWhite: stats?.roundsSinceLastWhite,
      averageGap: stats?.averageGap,
    });

    // Fetch learned white patterns
    const { data: whitePatterns, error: patternsError } = await supabase
      .from('white_patterns')
      .select('*');

    if (patternsError) {
      console.error('Error fetching white patterns:', patternsError);
    }

    // Update white patterns based on current state
    const gapRange = getGapRange(stats.roundsSinceLastWhite);
    
    // Check if white appeared (current round is white)
    const whiteAppeared = recentColors[0] === 'white';
    
    if (whiteAppeared) {
      // Update the pattern statistics when white appears
      const previousGapRange = getGapRange(stats.roundsSinceLastWhite);
      
      try {
        const { error: updateError } = await supabase
          .from('white_patterns')
          .update({
            times_white_appeared: (whitePatterns?.find(p => p.gap_range === previousGapRange)?.times_white_appeared || 0) + 1,
            average_gap_when_appeared: stats.roundsSinceLastWhite,
            sequence_before_white: recentColors.slice(1, 11)
          })
          .eq('gap_range', previousGapRange);

        if (updateError) {
          console.error('Error updating white pattern:', updateError);
        }
      } catch (e) {
        console.error('Error in white pattern update:', e);
      }
    } else {
      // Increment times_seen for current gap range
      try {
        const currentPattern = whitePatterns?.find(p => p.gap_range === gapRange);
        if (currentPattern) {
          await supabase
            .from('white_patterns')
            .update({
              times_seen: currentPattern.times_seen + 1
            })
            .eq('gap_range', gapRange);
        }
      } catch (e) {
        console.error('Error incrementing times_seen:', e);
      }
    }

    // Calculate learned probability for current gap
    const currentGapPattern = whitePatterns?.find(p => p.gap_range === gapRange);
    const learnedProbability = currentGapPattern && currentGapPattern.times_seen > 0
      ? (currentGapPattern.times_white_appeared / currentGapPattern.times_seen) * 100
      : null;

    // Analyze sequence patterns that preceded whites
    const sequenceAnalysis = analyzeSequencePatterns(whitePatterns || [], recentColors.slice(0, 10));

    // Build analysis prompt
    const colorSequence = recentColors.slice(-30).join(', ');
    const numberSequence = recentNumbers.slice(-30).join(', ');
    
    const learnedContext = learnedProbability !== null ? `
DADOS APRENDIDOS:
- Probabilidade histórica de branco no gap ${gapRange}: ${learnedProbability.toFixed(1)}%
- Vezes que branco apareceu neste gap: ${currentGapPattern?.times_white_appeared || 0}
- Total de observações: ${currentGapPattern?.times_seen || 0}
${sequenceAnalysis.similarity > 0.5 ? `- ATENÇÃO: Sequência atual similar a sequências que precederam brancos (${(sequenceAnalysis.similarity * 100).toFixed(0)}% similaridade)` : ''}
` : '';

    const systemPrompt = `Você é uma IA especialista em análise estatística do jogo Blaze Double com capacidade de APRENDIZADO.
Sua função é analisar padrões e recomendar quando fazer proteção no BRANCO.

O branco aparece quando sai o número 0, com probabilidade teórica de ~7% (1 em 14).
Branco paga 14x o valor apostado.

Análise estatística atual:
- Rodadas sem branco: ${stats.roundsSinceLastWhite}
- Média histórica entre brancos: ${stats.averageGap.toFixed(1)} rodadas
- Gap máximo já registrado: ${stats.maxGap || 'N/A'} rodadas
- Percentual de brancos: ${stats.whitePercentage.toFixed(2)}%

${learnedContext}

REGRAS DE ANÁLISE COM APRENDIZADO:
1. PRIORIZE os dados aprendidos se houver observações suficientes (>10)
2. Se roundsSinceLastWhite >= 25: ALTA recomendação (confiança 75-90%)
3. Se roundsSinceLastWhite >= 18: MÉDIA recomendação (confiança 55-74%)
4. Se roundsSinceLastWhite >= 12 E abaixo da média: BAIXA recomendação (confiança 40-54%)
5. Se sequência atual é similar a sequências que precederam brancos: AUMENTAR confiança
6. Caso contrário: SEM recomendação

IMPORTANTE: Use o aprendizado histórico para refinar suas previsões. Seja conservador mas atento aos padrões.`;

    const userPrompt = `Analise a sequência de cores e números abaixo e decida se devo proteger no branco.

Últimas 30 cores: ${colorSequence}
Últimos 30 números: ${numberSequence}

Rodadas sem branco: ${stats.roundsSinceLastWhite}
Média entre brancos: ${stats.averageGap.toFixed(1)}
Faixa de gap atual: ${gapRange}

Responda APENAS com um JSON válido no formato:
{
  "shouldProtect": boolean,
  "confidence": number (0-100),
  "reason": "string explicando a análise em português, incluindo dados aprendidos se relevante",
  "suggestedAmount": number (porcentagem da aposta, 0-20),
  "learnedFactors": ["lista de fatores aprendidos que influenciaram a decisão"]
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
      
      // Return enhanced rule-based fallback with learned data
      return new Response(JSON.stringify(generateEnhancedFallback(stats, currentGapPattern, sequenceAnalysis)), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('AI Response:', content);

    // Parse JSON from response
    let result;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      result = generateEnhancedFallback(stats, currentGapPattern, sequenceAnalysis);
    }

    // Validate and sanitize result
    const sanitizedResult = {
      shouldProtect: Boolean(result.shouldProtect),
      confidence: Math.min(100, Math.max(0, Number(result.confidence) || 50)),
      reason: String(result.reason || 'Análise concluída'),
      suggestedAmount: Math.min(20, Math.max(0, Number(result.suggestedAmount) || 0)),
      learnedFactors: result.learnedFactors || [],
      gapRange,
      learnedProbability
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

function getGapRange(gap: number): string {
  if (gap <= 10) return '0-10';
  if (gap <= 15) return '11-15';
  if (gap <= 20) return '16-20';
  if (gap <= 25) return '21-25';
  if (gap <= 30) return '26-30';
  return '31+';
}

function analyzeSequencePatterns(patterns: any[], currentSequence: string[]): { similarity: number; matchedSequences: string[][] } {
  let maxSimilarity = 0;
  const matchedSequences: string[][] = [];

  for (const pattern of patterns) {
    if (pattern.sequence_before_white && Array.isArray(pattern.sequence_before_white)) {
      const similarity = calculateSequenceSimilarity(currentSequence, pattern.sequence_before_white);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
      }
      if (similarity > 0.5) {
        matchedSequences.push(pattern.sequence_before_white);
      }
    }
  }

  return { similarity: maxSimilarity, matchedSequences };
}

function calculateSequenceSimilarity(seq1: string[], seq2: string[]): number {
  if (!seq1 || !seq2 || seq1.length === 0 || seq2.length === 0) return 0;
  
  const minLen = Math.min(seq1.length, seq2.length, 10);
  let matches = 0;
  
  for (let i = 0; i < minLen; i++) {
    if (seq1[i] === seq2[i]) matches++;
  }
  
  return matches / minLen;
}

function generateEnhancedFallback(
  stats: { roundsSinceLastWhite: number; averageGap: number; whitePercentage: number },
  learnedPattern: any,
  sequenceAnalysis: { similarity: number; matchedSequences: string[][] }
) {
  const { roundsSinceLastWhite, averageGap } = stats;
  
  // Boost confidence if learned data suggests high probability
  let confidenceBoost = 0;
  let learnedFactors: string[] = [];
  
  if (learnedPattern && learnedPattern.times_seen > 10) {
    const learnedProb = (learnedPattern.times_white_appeared / learnedPattern.times_seen) * 100;
    if (learnedProb > 15) {
      confidenceBoost += 10;
      learnedFactors.push(`Histórico: ${learnedProb.toFixed(1)}% de brancos neste gap`);
    }
  }
  
  if (sequenceAnalysis.similarity > 0.6) {
    confidenceBoost += 8;
    learnedFactors.push(`Sequência ${(sequenceAnalysis.similarity * 100).toFixed(0)}% similar a padrões pré-branco`);
  }
  
  if (roundsSinceLastWhite >= 25) {
    return {
      shouldProtect: true,
      confidence: Math.min(95, 65 + (roundsSinceLastWhite - 25) * 2 + confidenceBoost),
      reason: `${roundsSinceLastWhite} rodadas sem branco - estatisticamente muito atrasado${learnedFactors.length > 0 ? '. ' + learnedFactors.join('. ') : ''}`,
      suggestedAmount: 15,
      learnedFactors
    };
  }
  
  if (roundsSinceLastWhite >= 18) {
    return {
      shouldProtect: true,
      confidence: Math.min(85, 55 + Math.min(20, roundsSinceLastWhite - 18) + confidenceBoost),
      reason: `${roundsSinceLastWhite} rodadas sem branco - acima da média de ${averageGap.toFixed(0)}${learnedFactors.length > 0 ? '. ' + learnedFactors.join('. ') : ''}`,
      suggestedAmount: 10,
      learnedFactors
    };
  }
  
  if (roundsSinceLastWhite >= 12 && averageGap <= 12) {
    return {
      shouldProtect: true,
      confidence: Math.min(70, 45 + confidenceBoost),
      reason: `Padrão sugere branco próximo (média: ${averageGap.toFixed(0)} rodadas)${learnedFactors.length > 0 ? '. ' + learnedFactors.join('. ') : ''}`,
      suggestedAmount: 7,
      learnedFactors
    };
  }
  
  // If sequence analysis shows high similarity, recommend even at lower gaps
  if (sequenceAnalysis.similarity > 0.7 && roundsSinceLastWhite >= 8) {
    return {
      shouldProtect: true,
      confidence: 55 + confidenceBoost,
      reason: `Sequência atual muito similar a padrões que precederam brancos anteriormente`,
      suggestedAmount: 5,
      learnedFactors
    };
  }
  
  return {
    shouldProtect: false,
    confidence: 30,
    reason: `${roundsSinceLastWhite} rodadas sem branco - dentro do esperado`,
    suggestedAmount: 0,
    learnedFactors: []
  };
}