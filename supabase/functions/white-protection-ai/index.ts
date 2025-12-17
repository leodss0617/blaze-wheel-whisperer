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

    // Get Brasília time
    const now = new Date();
    const brasiliaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const currentHour = brasiliaTime.getHours();
    const currentMinute = brasiliaTime.getMinutes();

    console.log('White Protection AI - Analyzing:', {
      brasiliaTime: `${currentHour}:${currentMinute}`,
      colorsCount: recentColors?.length,
      numbersCount: recentNumbers?.length,
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

    // ============= COMPREHENSIVE WHITE ANALYSIS =============

    // 1. REAL DUPLICATE NUMBER ANALYSIS
    const duplicateAnalysis = analyzeRealDuplicates(recentNumbers, recentColors);
    
    // 2. TIME-BASED WHITE ANALYSIS
    const timeAnalysis = analyzeTimeFactors(currentHour, currentMinute);
    
    // 3. NUMBER SEQUENCE BEFORE WHITE ANALYSIS
    const numberSequenceAnalysis = analyzeNumbersBeforeWhite(recentNumbers, recentColors);
    
    // 4. GAP PATTERN ANALYSIS
    const gapRange = getGapRange(stats.roundsSinceLastWhite);
    const currentGapPattern = whitePatterns?.find(p => p.gap_range === gapRange);
    
    // 5. SEQUENCE SIMILARITY ANALYSIS
    const sequenceAnalysis = analyzeSequencePatterns(whitePatterns || [], recentColors.slice(0, 10));
    
    // 6. STREAK BEFORE WHITE ANALYSIS
    const streakAnalysis = analyzeStreaksBeforeWhite(recentColors);
    
    // 7. COLOR EQUILIBRIUM BEFORE WHITE
    const equilibriumAnalysis = analyzeEquilibriumBeforeWhite(recentColors);

    // Update white patterns based on current state
    const whiteAppeared = recentColors[0] === 'white';
    
    if (whiteAppeared) {
      const previousGapRange = getGapRange(stats.roundsSinceLastWhite);
      
      try {
        await supabase
          .from('white_patterns')
          .update({
            times_white_appeared: (whitePatterns?.find(p => p.gap_range === previousGapRange)?.times_white_appeared || 0) + 1,
            average_gap_when_appeared: stats.roundsSinceLastWhite,
            sequence_before_white: recentColors.slice(1, 11)
          })
          .eq('gap_range', previousGapRange);
      } catch (e) {
        console.error('Error updating white pattern:', e);
      }
    } else {
      try {
        if (currentGapPattern) {
          await supabase
            .from('white_patterns')
            .update({ times_seen: currentGapPattern.times_seen + 1 })
            .eq('gap_range', gapRange);
        }
      } catch (e) {
        console.error('Error incrementing times_seen:', e);
      }
    }

    // Calculate learned probability for current gap
    const learnedProbability = currentGapPattern && currentGapPattern.times_seen > 0
      ? (currentGapPattern.times_white_appeared / currentGapPattern.times_seen) * 100
      : null;

    // Build comprehensive analysis context
    const analysisContext = buildAnalysisContext({
      duplicateAnalysis,
      timeAnalysis,
      numberSequenceAnalysis,
      streakAnalysis,
      equilibriumAnalysis,
      sequenceAnalysis,
      learnedProbability,
      currentGapPattern,
      stats,
      gapRange
    });

    const systemPrompt = `Você é uma IA especialista em análise estatística do jogo Blaze Double com APRENDIZADO CONTÍNUO.
Sua função é analisar padrões e recomendar quando fazer proteção no BRANCO.

O branco aparece quando sai o número 0, com probabilidade teórica de ~7% (1 em 14).
Branco paga 14x o valor apostado.

Horário Brasília: ${currentHour}:${currentMinute < 10 ? '0' : ''}${currentMinute}

ESTATÍSTICAS ATUAIS:
- Rodadas sem branco: ${stats.roundsSinceLastWhite}
- Média histórica entre brancos: ${stats.averageGap.toFixed(1)} rodadas
- Gap máximo registrado: ${stats.maxGap || 'N/A'} rodadas
- Percentual de brancos: ${stats.whitePercentage.toFixed(2)}%
- Faixa de gap atual: ${gapRange}

${analysisContext}

REGRAS DE ANÁLISE AVANÇADAS:
1. DUPLICATAS REAIS: Se há número duplicado E histórico mostra branco após duplicatas similares, AUMENTAR recomendação
2. HORÁRIO: Certos horários têm maior incidência de brancos - considere isso
3. SEQUÊNCIA NUMÉRICA: Analise os números específicos que precederam brancos anteriormente
4. STREAKS: Após sequências longas de mesma cor, brancos podem aparecer
5. EQUILÍBRIO: Desequilíbrio extremo entre cores pode preceder brancos
6. GAP APRENDIDO: Use probabilidade histórica do gap atual
7. SIMILARIDADE: Sequências similares às que precederam brancos aumentam probabilidade

THRESHOLDS DE RECOMENDAÇÃO:
- Gap >= 25: ALTA recomendação (70-90% confiança)
- Gap >= 18: MÉDIA recomendação (55-69% confiança)  
- Gap >= 12 + fatores adicionais: BAIXA recomendação (40-54% confiança)
- Múltiplos fatores convergentes: BOOST de confiança`;

    const userPrompt = `Analise TODOS os fatores abaixo e decida se devo proteger no branco.

Últimas cores: ${recentColors.slice(0, 30).join(', ')}
Últimos números: ${recentNumbers.slice(0, 30).join(', ')}

Rodadas sem branco: ${stats.roundsSinceLastWhite}
Média entre brancos: ${stats.averageGap.toFixed(1)}

ANÁLISES DETALHADAS:
${JSON.stringify({
  duplicatas: duplicateAnalysis,
  horario: timeAnalysis,
  numerosPreBranco: numberSequenceAnalysis,
  streaks: streakAnalysis,
  equilibrio: equilibriumAnalysis,
  similaridade: sequenceAnalysis.similarity
}, null, 2)}

Responda APENAS com JSON válido:
{
  "shouldProtect": boolean,
  "confidence": number (0-100),
  "reason": "explicação detalhada em português incluindo fatores que influenciaram",
  "suggestedAmount": number (porcentagem 0-20),
  "keyFactors": ["lista dos principais fatores considerados"]
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
        max_tokens: 600,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      return new Response(JSON.stringify(generateEnhancedFallback({
        stats,
        currentGapPattern,
        sequenceAnalysis,
        duplicateAnalysis,
        timeAnalysis,
        streakAnalysis,
        equilibriumAnalysis
      })), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('White AI Response:', content);

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
      result = generateEnhancedFallback({
        stats,
        currentGapPattern,
        sequenceAnalysis,
        duplicateAnalysis,
        timeAnalysis,
        streakAnalysis,
        equilibriumAnalysis
      });
    }

    const sanitizedResult = {
      shouldProtect: Boolean(result.shouldProtect),
      confidence: Math.min(100, Math.max(0, Number(result.confidence) || 50)),
      reason: String(result.reason || 'Análise concluída'),
      suggestedAmount: Math.min(20, Math.max(0, Number(result.suggestedAmount) || 0)),
      keyFactors: result.keyFactors || result.learnedFactors || [],
      gapRange,
      learnedProbability,
      analysisDetails: {
        duplicateScore: duplicateAnalysis.whiteAfterDuplicateRate,
        timeScore: timeAnalysis.whiteFrequencyScore,
        streakScore: streakAnalysis.avgStreakBeforeWhite,
        equilibriumScore: equilibriumAnalysis.whiteAfterImbalanceRate
      }
    };

    console.log('White Protection Result:', sanitizedResult);

    return new Response(JSON.stringify(sanitizedResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('White Protection AI error:', error);
    return new Response(JSON.stringify({ 
      shouldProtect: false,
      confidence: 30,
      reason: 'Sistema usando regras locais - análise básica',
      suggestedAmount: 0,
      fallbackMode: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ============= ANALYSIS FUNCTIONS =============

function analyzeRealDuplicates(numbers: number[], colors: string[]): {
  hasRecentDuplicate: boolean;
  duplicateNumber: number | null;
  duplicatePosition: number;
  whiteAfterDuplicateRate: number;
  duplicateDetails: string;
} {
  // Find actual consecutive or near-consecutive duplicates
  let hasRecentDuplicate = false;
  let duplicateNumber = null;
  let duplicatePosition = -1;
  
  // Check for duplicates in last 10 rounds
  for (let i = 0; i < Math.min(10, numbers.length - 1); i++) {
    for (let j = i + 1; j < Math.min(i + 5, numbers.length); j++) {
      if (numbers[i] === numbers[j]) {
        if (!hasRecentDuplicate || i < duplicatePosition) {
          hasRecentDuplicate = true;
          duplicateNumber = numbers[i];
          duplicatePosition = i;
        }
      }
    }
  }
  
  // Analyze historical: after duplicates, how often did white appear?
  let duplicatesFound = 0;
  let whitesAfterDuplicate = 0;
  
  for (let i = 0; i < numbers.length - 5; i++) {
    for (let j = i + 1; j < Math.min(i + 4, numbers.length); j++) {
      if (numbers[i] === numbers[j]) {
        duplicatesFound++;
        // Check if white appeared in next 3 rounds after duplicate
        for (let k = 0; k < Math.min(3, i); k++) {
          if (colors[i - 1 - k] === 'white') {
            whitesAfterDuplicate++;
            break;
          }
        }
        break;
      }
    }
  }
  
  const whiteAfterDuplicateRate = duplicatesFound > 0 
    ? (whitesAfterDuplicate / duplicatesFound) * 100 
    : 0;
  
  return {
    hasRecentDuplicate,
    duplicateNumber,
    duplicatePosition,
    whiteAfterDuplicateRate,
    duplicateDetails: hasRecentDuplicate 
      ? `Número ${duplicateNumber} duplicado na posição ${duplicatePosition}` 
      : 'Sem duplicatas recentes'
  };
}

function analyzeTimeFactors(hour: number, minute: number): {
  whiteFrequencyScore: number;
  timeRiskLevel: string;
  details: string;
} {
  // Time-based white frequency patterns (based on typical game patterns)
  let whiteFrequencyScore = 50; // Base score
  let timeRiskLevel = 'normal';
  let details = '';
  
  // Early morning tends to have different patterns
  if (hour >= 3 && hour <= 6) {
    whiteFrequencyScore = 55;
    timeRiskLevel = 'elevado';
    details = 'Horário de madrugada - padrões menos previsíveis';
  }
  // Peak hours
  else if ((hour >= 20 && hour <= 23) || (hour >= 0 && hour <= 2)) {
    whiteFrequencyScore = 52;
    timeRiskLevel = 'normal-alto';
    details = 'Horário de pico - volume alto de jogos';
  }
  // Specific minute patterns
  else if (minute >= 50 && minute <= 59) {
    whiteFrequencyScore = 54;
    timeRiskLevel = 'transição';
    details = 'Final de hora - período de transição';
  }
  else {
    details = 'Horário regular';
  }
  
  return { whiteFrequencyScore, timeRiskLevel, details };
}

function analyzeNumbersBeforeWhite(numbers: number[], colors: string[]): {
  numbersBeforeWhite: number[];
  currentNumberMatch: boolean;
  matchScore: number;
} {
  // Find numbers that appeared right before whites
  const numbersBeforeWhite: number[] = [];
  
  for (let i = 0; i < colors.length - 1; i++) {
    if (colors[i] === 'white' && i + 1 < numbers.length) {
      numbersBeforeWhite.push(numbers[i + 1]);
    }
  }
  
  // Check if current number matches pattern
  const currentNumber = numbers[0];
  const currentNumberMatch = numbersBeforeWhite.includes(currentNumber);
  
  // Calculate how often current number preceded white
  const matchCount = numbersBeforeWhite.filter(n => n === currentNumber).length;
  const matchScore = numbersBeforeWhite.length > 0 
    ? (matchCount / numbersBeforeWhite.length) * 100 
    : 0;
  
  return {
    numbersBeforeWhite: [...new Set(numbersBeforeWhite)].slice(0, 10),
    currentNumberMatch,
    matchScore
  };
}

function analyzeStreaksBeforeWhite(colors: string[]): {
  avgStreakBeforeWhite: number;
  currentStreak: number;
  streakColor: string;
  streakIndicatesWhite: boolean;
} {
  // Find streak lengths that preceded whites
  const streaksBeforeWhite: number[] = [];
  
  for (let i = 0; i < colors.length; i++) {
    if (colors[i] === 'white') {
      // Count streak before this white
      let streak = 0;
      let streakColor = '';
      for (let j = i + 1; j < colors.length; j++) {
        if (colors[j] !== 'white') {
          if (streakColor === '' || colors[j] === streakColor) {
            streakColor = colors[j];
            streak++;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      if (streak > 0) {
        streaksBeforeWhite.push(streak);
      }
    }
  }
  
  const avgStreakBeforeWhite = streaksBeforeWhite.length > 0
    ? streaksBeforeWhite.reduce((a, b) => a + b, 0) / streaksBeforeWhite.length
    : 0;
  
  // Calculate current streak
  let currentStreak = 0;
  let currentStreakColor = '';
  for (const color of colors) {
    if (color === 'white') break;
    if (currentStreakColor === '' || color === currentStreakColor) {
      currentStreakColor = color;
      currentStreak++;
    } else {
      break;
    }
  }
  
  const streakIndicatesWhite = currentStreak >= avgStreakBeforeWhite && avgStreakBeforeWhite > 2;
  
  return {
    avgStreakBeforeWhite,
    currentStreak,
    streakColor: currentStreakColor,
    streakIndicatesWhite
  };
}

function analyzeEquilibriumBeforeWhite(colors: string[]): {
  currentRedPercent: number;
  currentBlackPercent: number;
  imbalanceLevel: number;
  whiteAfterImbalanceRate: number;
} {
  // Analyze color balance in last 20 rounds (excluding white)
  const last20 = colors.slice(0, 20).filter(c => c !== 'white');
  const redCount = last20.filter(c => c === 'red').length;
  const blackCount = last20.filter(c => c === 'black').length;
  const total = redCount + blackCount;
  
  const currentRedPercent = total > 0 ? (redCount / total) * 100 : 50;
  const currentBlackPercent = total > 0 ? (blackCount / total) * 100 : 50;
  const imbalanceLevel = Math.abs(currentRedPercent - 50);
  
  // Check historical: after imbalances, how often did white appear?
  let imbalancesFound = 0;
  let whitesAfterImbalance = 0;
  
  for (let i = 5; i < colors.length - 20; i++) {
    const window = colors.slice(i, i + 20).filter(c => c !== 'white');
    const reds = window.filter(c => c === 'red').length;
    const windowTotal = window.length;
    if (windowTotal > 0) {
      const windowImbalance = Math.abs((reds / windowTotal) * 100 - 50);
      if (windowImbalance > 20) {
        imbalancesFound++;
        // Check if white appeared in next 5 rounds
        for (let k = 0; k < Math.min(5, i); k++) {
          if (colors[i - 1 - k] === 'white') {
            whitesAfterImbalance++;
            break;
          }
        }
      }
    }
  }
  
  const whiteAfterImbalanceRate = imbalancesFound > 0 
    ? (whitesAfterImbalance / imbalancesFound) * 100 
    : 0;
  
  return {
    currentRedPercent,
    currentBlackPercent,
    imbalanceLevel,
    whiteAfterImbalanceRate
  };
}

function buildAnalysisContext(data: any): string {
  const parts: string[] = [];
  
  if (data.duplicateAnalysis.hasRecentDuplicate) {
    parts.push(`DUPLICATA REAL: ${data.duplicateAnalysis.duplicateDetails}`);
    parts.push(`  - Taxa de branco após duplicatas: ${data.duplicateAnalysis.whiteAfterDuplicateRate.toFixed(1)}%`);
  }
  
  parts.push(`HORÁRIO: ${data.timeAnalysis.details} (Score: ${data.timeAnalysis.whiteFrequencyScore})`);
  
  if (data.numberSequenceAnalysis.currentNumberMatch) {
    parts.push(`NÚMERO PRÉ-BRANCO: Número atual já precedeu brancos (match: ${data.numberSequenceAnalysis.matchScore.toFixed(1)}%)`);
  }
  
  if (data.streakAnalysis.currentStreak >= 3) {
    parts.push(`STREAK: ${data.streakAnalysis.currentStreak}x ${data.streakAnalysis.streakColor} (média pré-branco: ${data.streakAnalysis.avgStreakBeforeWhite.toFixed(1)})`);
    if (data.streakAnalysis.streakIndicatesWhite) {
      parts.push(`  - ATENÇÃO: Streak atual indica possível branco`);
    }
  }
  
  if (data.equilibriumAnalysis.imbalanceLevel > 15) {
    parts.push(`DESEQUILÍBRIO: ${data.equilibriumAnalysis.currentRedPercent.toFixed(0)}% red vs ${data.equilibriumAnalysis.currentBlackPercent.toFixed(0)}% black`);
    parts.push(`  - Taxa de branco após desequilíbrio: ${data.equilibriumAnalysis.whiteAfterImbalanceRate.toFixed(1)}%`);
  }
  
  if (data.learnedProbability !== null && data.currentGapPattern?.times_seen > 10) {
    parts.push(`APRENDIZADO: ${data.learnedProbability.toFixed(1)}% probabilidade histórica no gap ${data.gapRange}`);
  }
  
  if (data.sequenceAnalysis.similarity > 0.5) {
    parts.push(`SIMILARIDADE: ${(data.sequenceAnalysis.similarity * 100).toFixed(0)}% com sequências pré-branco`);
  }
  
  return parts.length > 0 ? '\nANÁLISE DETALHADA:\n' + parts.join('\n') : '';
}

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

function generateEnhancedFallback(data: {
  stats: { roundsSinceLastWhite: number; averageGap: number; whitePercentage: number };
  currentGapPattern: any;
  sequenceAnalysis: { similarity: number; matchedSequences: string[][] };
  duplicateAnalysis: any;
  timeAnalysis: any;
  streakAnalysis: any;
  equilibriumAnalysis: any;
}) {
  const { stats, currentGapPattern, sequenceAnalysis, duplicateAnalysis, timeAnalysis, streakAnalysis, equilibriumAnalysis } = data;
  const { roundsSinceLastWhite, averageGap } = stats;
  
  // Calculate confidence boost from multiple factors
  let confidenceBoost = 0;
  const keyFactors: string[] = [];
  
  // Learned pattern boost
  if (currentGapPattern && currentGapPattern.times_seen > 10) {
    const learnedProb = (currentGapPattern.times_white_appeared / currentGapPattern.times_seen) * 100;
    if (learnedProb > 15) {
      confidenceBoost += 10;
      keyFactors.push(`Histórico: ${learnedProb.toFixed(1)}% brancos neste gap`);
    }
  }
  
  // Sequence similarity boost
  if (sequenceAnalysis.similarity > 0.6) {
    confidenceBoost += 8;
    keyFactors.push(`Similaridade ${(sequenceAnalysis.similarity * 100).toFixed(0)}% com padrões pré-branco`);
  }
  
  // Duplicate boost
  if (duplicateAnalysis.hasRecentDuplicate && duplicateAnalysis.whiteAfterDuplicateRate > 10) {
    confidenceBoost += 6;
    keyFactors.push(`Duplicata real detectada (${duplicateAnalysis.whiteAfterDuplicateRate.toFixed(0)}% taxa branco)`);
  }
  
  // Streak boost
  if (streakAnalysis.streakIndicatesWhite) {
    confidenceBoost += 5;
    keyFactors.push(`Streak ${streakAnalysis.currentStreak}x indica branco`);
  }
  
  // Equilibrium boost
  if (equilibriumAnalysis.imbalanceLevel > 20 && equilibriumAnalysis.whiteAfterImbalanceRate > 10) {
    confidenceBoost += 4;
    keyFactors.push(`Desequilíbrio ${equilibriumAnalysis.imbalanceLevel.toFixed(0)}% detectado`);
  }
  
  // Time boost
  if (timeAnalysis.whiteFrequencyScore > 52) {
    confidenceBoost += 3;
    keyFactors.push(timeAnalysis.details);
  }
  
  // Decision based on gap + boosts
  if (roundsSinceLastWhite >= 25) {
    return {
      shouldProtect: true,
      confidence: Math.min(95, 70 + (roundsSinceLastWhite - 25) * 2 + confidenceBoost),
      reason: `${roundsSinceLastWhite} rodadas sem branco - MUITO atrasado. ${keyFactors.join('. ')}`,
      suggestedAmount: 15,
      keyFactors
    };
  }
  
  if (roundsSinceLastWhite >= 18) {
    return {
      shouldProtect: true,
      confidence: Math.min(85, 55 + Math.min(15, roundsSinceLastWhite - 18) + confidenceBoost),
      reason: `${roundsSinceLastWhite} rodadas sem branco - acima da média (${averageGap.toFixed(0)}). ${keyFactors.join('. ')}`,
      suggestedAmount: 10,
      keyFactors
    };
  }
  
  if (roundsSinceLastWhite >= 12 && (averageGap <= 12 || confidenceBoost >= 15)) {
    return {
      shouldProtect: true,
      confidence: Math.min(70, 45 + confidenceBoost),
      reason: `Múltiplos fatores indicam branco próximo. ${keyFactors.join('. ')}`,
      suggestedAmount: 7,
      keyFactors
    };
  }
  
  // High confidence from factors alone
  if (confidenceBoost >= 20 && roundsSinceLastWhite >= 8) {
    return {
      shouldProtect: true,
      confidence: 55 + Math.min(20, confidenceBoost - 20),
      reason: `Fatores convergentes indicam branco. ${keyFactors.join('. ')}`,
      suggestedAmount: 5,
      keyFactors
    };
  }
  
  return {
    shouldProtect: false,
    confidence: 30,
    reason: `${roundsSinceLastWhite} rodadas sem branco - dentro do esperado`,
    suggestedAmount: 0,
    keyFactors: []
  };
}
