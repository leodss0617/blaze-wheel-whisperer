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

    // Fetch recent rounds from database with unique identification
    const { data: recentRounds, error: roundsError } = await supabase
      .from('blaze_rounds')
      .select('*')
      .order('round_timestamp', { ascending: false })
      .limit(150);

    if (roundsError) {
      console.error('Error fetching rounds:', roundsError);
      throw roundsError;
    }

    // Fetch learned patterns
    const { data: learnedPatterns, error: patternsError } = await supabase
      .from('learned_patterns')
      .select('*')
      .order('success_rate', { ascending: false })
      .limit(100);

    if (patternsError) {
      console.error('Error fetching patterns:', patternsError);
    }

    // Fetch recent signals with their outcomes
    const { data: pastSignals, error: signalsError } = await supabase
      .from('prediction_signals')
      .select('*')
      .order('signal_timestamp', { ascending: false })
      .limit(100);

    if (signalsError) {
      console.error('Error fetching signals:', signalsError);
      throw signalsError;
    }

    // Calculate performance metrics
    const completedSignals = pastSignals?.filter(s => s.status !== 'pending') || [];
    const wins = completedSignals.filter(s => s.status === 'win').length;
    const losses = completedSignals.filter(s => s.status === 'loss').length;
    const winRate = completedSignals.length > 0 ? (wins / completedSignals.length * 100).toFixed(1) : '0';

    // Extract pattern analysis data
    const last20Rounds = recentRounds?.slice(0, 20) || [];
    const last50Rounds = recentRounds?.slice(0, 50) || [];
    const last100Rounds = recentRounds?.slice(0, 100) || [];
    
    const last20Colors = last20Rounds.map(r => r.color);
    const last50Colors = last50Rounds.map(r => r.color);

    // Create unique round identifiers (blaze_id + timestamp + number)
    const roundIdentifiers = last20Rounds.map(r => ({
      id: r.blaze_id,
      color: r.color,
      number: r.number,
      timestamp: r.round_timestamp,
      uniqueKey: `${r.blaze_id}_${r.number}_${new Date(r.round_timestamp).getTime()}`
    }));
    
    // Count color frequencies
    const countColors = (colors: string[]) => ({
      red: colors.filter(c => c === 'red').length,
      black: colors.filter(c => c === 'black').length,
      white: colors.filter(c => c === 'white').length,
    });

    const last20Stats = countColors(last20Colors);
    const last50Stats = countColors(last50Colors);

    // Find current streak
    let currentStreak = { color: last20Colors[0], count: 1 };
    for (let i = 1; i < last20Colors.length; i++) {
      if (last20Colors[i] === currentStreak.color) {
        currentStreak.count++;
      } else {
        break;
      }
    }

    // Analyze patterns with unique identification
    const analyzePatterns = () => {
      const patterns: { type: string; key: string; data: any; prediction: string }[] = [];
      
      // Pattern 1: Sequence of last 3 colors
      if (last20Colors.length >= 3) {
        const seq3 = last20Colors.slice(0, 3).join('-');
        patterns.push({
          type: 'sequence_3',
          key: seq3,
          data: { sequence: seq3, afterRound: roundIdentifiers[0] },
          prediction: last20Colors[0] === last20Colors[1] ? 
            (last20Colors[0] === 'red' ? 'black' : 'red') : last20Colors[0]
        });
      }

      // Pattern 2: Streak patterns
      if (currentStreak.count >= 2) {
        const streakKey = `${currentStreak.color}_${currentStreak.count}`;
        patterns.push({
          type: 'streak',
          key: streakKey,
          data: { color: currentStreak.color, count: currentStreak.count },
          prediction: currentStreak.count >= 4 ? 
            (currentStreak.color === 'red' ? 'black' : 'red') : currentStreak.color
        });
      }

      // Pattern 3: Dominance pattern (which color dominates last 20)
      const dominant = last20Stats.red > last20Stats.black ? 'red' : 'black';
      const dominanceRatio = Math.max(last20Stats.red, last20Stats.black) / 20;
      patterns.push({
        type: 'dominance_20',
        key: `${dominant}_${Math.round(dominanceRatio * 100)}`,
        data: { dominant, ratio: dominanceRatio, stats: last20Stats },
        prediction: dominanceRatio > 0.6 ? (dominant === 'red' ? 'black' : 'red') : dominant
      });

      // Pattern 4: After white pattern
      const lastWhiteIndex = last50Colors.indexOf('white');
      if (lastWhiteIndex !== -1 && lastWhiteIndex < 10) {
        const colorsAfterWhite = last50Colors.slice(0, lastWhiteIndex);
        const afterWhiteKey = `after_white_${colorsAfterWhite.length}`;
        patterns.push({
          type: 'after_white',
          key: afterWhiteKey,
          data: { roundsAfterWhite: colorsAfterWhite.length, colors: colorsAfterWhite },
          prediction: colorsAfterWhite.length < 5 ? 
            (countColors(colorsAfterWhite).red >= countColors(colorsAfterWhite).black ? 'red' : 'black') : 
            (dominant === 'red' ? 'black' : 'red')
        });
      }

      // Pattern 5: Alternation pattern
      let alternations = 0;
      for (let i = 0; i < Math.min(10, last20Colors.length - 1); i++) {
        if (last20Colors[i] !== last20Colors[i + 1] && 
            last20Colors[i] !== 'white' && last20Colors[i + 1] !== 'white') {
          alternations++;
        }
      }
      if (alternations >= 5) {
        patterns.push({
          type: 'high_alternation',
          key: `alt_${alternations}`,
          data: { alternations, lastColors: last20Colors.slice(0, 5) },
          prediction: last20Colors[0] === 'red' ? 'black' : 'red'
        });
      }

      return patterns;
    };

    const currentPatterns = analyzePatterns();

    // Find matching learned patterns
    const matchedLearnedPatterns = (learnedPatterns || []).filter(lp => 
      currentPatterns.some(cp => cp.type === lp.pattern_type && cp.key === lp.pattern_key)
    );

    // Calculate weighted prediction from learned patterns
    const getLearnedPrediction = () => {
      if (matchedLearnedPatterns.length === 0) return null;

      let redScore = 0;
      let blackScore = 0;
      let totalWeight = 0;

      for (const pattern of matchedLearnedPatterns) {
        const weight = pattern.times_seen * (pattern.success_rate / 100);
        const data = pattern.pattern_data;
        
        if (data.lastSuccessfulPrediction === 'red') {
          redScore += weight;
        } else if (data.lastSuccessfulPrediction === 'black') {
          blackScore += weight;
        }
        totalWeight += weight;
      }

      if (totalWeight === 0) return null;

      return {
        prediction: redScore > blackScore ? 'red' : 'black',
        confidence: Math.round(Math.abs(redScore - blackScore) / totalWeight * 100),
        basedOn: matchedLearnedPatterns.length
      };
    };

    const learnedPrediction = getLearnedPrediction();

    // Successful patterns analysis
    const successfulPatterns = completedSignals
      .filter(s => s.status === 'win')
      .slice(0, 10)
      .map(s => s.reason);
    
    const failedPatterns = completedSignals
      .filter(s => s.status === 'loss')
      .slice(0, 10)
      .map(s => ({ reason: s.reason, predicted: s.predicted_color, actual: s.actual_result }));

    // High success learned patterns
    const highSuccessPatterns = (learnedPatterns || [])
      .filter(p => p.success_rate >= 60 && p.times_seen >= 5)
      .slice(0, 10);

    // Build AI prompt with enhanced context
    const recalibrationContext = recalibrationMode ? `
ATENÇÃO: MODO RECALIBRAÇÃO ATIVADO!
A IA errou 2 vezes consecutivas. Você DEVE:
1. Inverter sua estratégia anterior
2. Analisar com muito mais cuidado os últimos resultados
3. Considerar que o padrão anterior estava ERRADO
4. Buscar um novo padrão nos dados mais recentes
5. Ser mais conservador e só apostar com alta confiança
6. Considerar a possibilidade de o mercado estar em transição
` : '';

    const learnedContext = learnedPrediction ? `
PREVISÃO BASEADA EM PADRÕES APRENDIDOS:
- Cor recomendada: ${learnedPrediction.prediction}
- Confiança do aprendizado: ${learnedPrediction.confidence}%
- Baseado em ${learnedPrediction.basedOn} padrões correspondentes
` : '';

    const highSuccessContext = highSuccessPatterns.length > 0 ? `
PADRÕES COM ALTA TAXA DE SUCESSO (>60%):
${highSuccessPatterns.map(p => `- ${p.pattern_type}: ${p.pattern_key} (${p.success_rate.toFixed(1)}% em ${p.times_seen} ocorrências)`).join('\n')}
` : '';

    const prompt = `Você é um especialista em análise de padrões do jogo Double da Blaze. 
Analise os dados históricos e faça uma previsão precisa usando aprendizado de máquina.
${recalibrationContext}

IDENTIFICAÇÃO ÚNICA DE RODADAS:
Cada rodada é identificada pelo blaze_id + número + timestamp, garantindo diferenciação mesmo com números repetidos.
Última rodada: ${roundIdentifiers[0]?.uniqueKey || 'N/A'}

DADOS ATUAIS:
- Últimas 20 cores: ${last20Colors.join(', ')}
- Últimos 20 números: ${last20Rounds.map(r => r.number).join(', ')}
- Sequência atual: ${currentStreak.count}x ${currentStreak.color}
- Últimas 20 rodadas: Vermelho=${last20Stats.red}, Preto=${last20Stats.black}, Branco=${last20Stats.white}
- Últimas 50 rodadas: Vermelho=${last50Stats.red}, Preto=${last50Stats.black}, Branco=${last50Stats.white}

PADRÕES IDENTIFICADOS AGORA:
${currentPatterns.map(p => `- ${p.type}: ${p.key} → sugere ${p.prediction}`).join('\n')}

${learnedContext}
${highSuccessContext}

HISTÓRICO DE PERFORMANCE:
- Total de sinais: ${completedSignals.length}
- Taxa de acerto: ${winRate}%
- Vitórias: ${wins}, Derrotas: ${losses}

PADRÕES QUE FUNCIONARAM (use como guia):
${successfulPatterns.slice(0, 5).map(p => `- ${p}`).join('\n') || '- Ainda coletando dados'}

PADRÕES QUE FALHARAM (EVITE ESTES!):
${failedPatterns.slice(0, 5).map(p => `- ${p.reason} (previu ${p.predicted}, saiu ${p.actual})`).join('\n') || '- Ainda coletando dados'}

REGRAS:
1. USE os padrões aprendidos com alta taxa de sucesso como base principal
2. Analise a sequência atual e probabilidades
3. ${recalibrationMode ? 'INVERTA sua estratégia - os padrões anteriores falharam!' : 'Priorize padrões com success_rate > 60%'}
4. Seja conservador - só dê previsão com alta confiança
5. Nunca preveja branco (probabilidade muito baixa)
6. Cada rodada é ÚNICA - mesmo números iguais em rodadas diferentes devem ser tratados separadamente
${recalibrationMode ? '7. ATENÇÃO: Modo recalibração - análise crítica necessária!' : ''}

Responda APENAS em JSON válido com este formato:
{
  "predicted_color": "red" ou "black",
  "confidence": número de 60 a 95,
  "reason": "explicação curta em português${recalibrationMode ? ' - mencione que é recalibração' : ''}",
  "analysis": "análise detalhada incluindo padrões usados",
  "protections": número de 1 a 3,
  "should_bet": true ou false,
  "patterns_used": ["lista dos padrões mais relevantes usados"]
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
          { role: 'system', content: 'Você é um analista de padrões especializado com capacidade de aprendizado contínuo. Sempre responda em JSON válido. Use os padrões aprendidos para melhorar suas previsões.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      // Use intelligent fallback instead of returning error
      console.log('Using fallback prediction system...');
      
      let fallbackPrediction;
      if (learnedPrediction && learnedPrediction.confidence > 50) {
        fallbackPrediction = {
          predicted_color: learnedPrediction.prediction,
          confidence: Math.min(75, learnedPrediction.confidence),
          reason: `Previsão baseada em ${learnedPrediction.basedOn} padrões aprendidos`,
          analysis: 'Sistema de aprendizado local ativo',
          protections: 2,
          should_bet: true,
          patterns_used: ['learned_patterns']
        };
      } else {
        // Statistical fallback
        const dominant = last20Stats.red > last20Stats.black ? 'black' : 'red';
        const streakFactor = currentStreak.count >= 3 ? 
          (currentStreak.color === 'red' ? 'black' : 'red') : dominant;
        
        fallbackPrediction = {
          predicted_color: currentStreak.count >= 4 ? streakFactor : dominant,
          confidence: 65 + Math.min(10, currentStreak.count * 2),
          reason: currentStreak.count >= 3 ? 
            `Sequência de ${currentStreak.count}x ${currentStreak.color} - inversão provável` :
            `Análise estatística: ${last20Stats.red > last20Stats.black ? 'Vermelho' : 'Preto'} dominante`,
          analysis: 'Sistema de análise estatística ativo',
          protections: 2,
          should_bet: true,
          patterns_used: ['statistical_analysis', 'streak_pattern']
        };
      }
      
      const lastRound = recentRounds && recentRounds.length > 0 ? {
        number: recentRounds[0].number,
        color: recentRounds[0].color,
        blaze_id: recentRounds[0].blaze_id,
        uniqueKey: roundIdentifiers[0]?.uniqueKey
      } : null;
      
      return new Response(JSON.stringify({
        prediction: fallbackPrediction,
        lastRound,
        currentPatterns: currentPatterns.map(p => ({ type: p.type, key: p.key })),
        learnedPrediction,
        stats: {
          last20Stats,
          last50Stats,
          currentStreak,
          winRate,
          totalSignals: completedSignals.length,
          learnedPatternsCount: (learnedPatterns || []).length,
          matchedPatternsCount: matchedLearnedPatterns.length
        },
        fallbackMode: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await response.json();
    const aiResponse = aiData.choices?.[0]?.message?.content;

    console.log('AI Response:', aiResponse);

    // Parse AI response
    let prediction;
    try {
      let jsonStr = aiResponse;
      const jsonMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      prediction = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Use learned prediction or statistical fallback
      if (learnedPrediction && learnedPrediction.confidence > 50) {
        prediction = {
          predicted_color: learnedPrediction.prediction,
          confidence: Math.min(75, learnedPrediction.confidence),
          reason: `Previsão baseada em ${learnedPrediction.basedOn} padrões aprendidos`,
          analysis: 'IA não disponível, usando sistema de aprendizado',
          protections: 2,
          should_bet: true,
          patterns_used: ['learned_patterns']
        };
      } else {
        prediction = {
          predicted_color: last20Stats.red > last20Stats.black ? 'black' : 'red',
          confidence: 65,
          reason: 'Análise estatística básica',
          analysis: 'IA não disponível, usando análise estatística',
          protections: 2,
          should_bet: true,
          patterns_used: ['statistical_fallback']
        };
      }
    }

    // Save current patterns for learning
    for (const pattern of currentPatterns) {
      try {
        const { error: upsertError } = await supabase
          .from('learned_patterns')
          .upsert({
            pattern_type: pattern.type,
            pattern_key: pattern.key,
            pattern_data: {
              ...pattern.data,
              lastPrediction: prediction.predicted_color,
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

        if (upsertError) {
          console.error('Error saving pattern:', upsertError);
        }
      } catch (e) {
        console.error('Error in pattern save:', e);
      }
    }

    // Get last round info
    const lastRound = recentRounds && recentRounds.length > 0 ? {
      number: recentRounds[0].number,
      color: recentRounds[0].color,
      blaze_id: recentRounds[0].blaze_id,
      uniqueKey: roundIdentifiers[0]?.uniqueKey
    } : null;

    return new Response(JSON.stringify({
      prediction,
      lastRound,
      currentPatterns: currentPatterns.map(p => ({ type: p.type, key: p.key })),
      learnedPrediction,
      stats: {
        last20Stats,
        last50Stats,
        currentStreak,
        winRate,
        totalSignals: completedSignals.length,
        learnedPatternsCount: (learnedPatterns || []).length,
        matchedPatternsCount: matchedLearnedPatterns.length
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