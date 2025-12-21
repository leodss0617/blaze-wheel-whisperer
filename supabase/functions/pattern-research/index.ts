import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.87.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PatternResearchResult {
  source: string;
  patterns: string[];
  strategies: string[];
  insights: string[];
  timestamp: Date;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl não configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Searching for roulette patterns and strategies...');

    // Search for roulette patterns and strategies
    const searchQueries = [
      'roulette betting patterns strategies analysis',
      'martingale roulette strategy optimization',
      'double roulette prediction patterns',
    ];

    const allResults: PatternResearchResult[] = [];
    const allInsights: string[] = [];
    const allStrategies: string[] = [];

    for (const query of searchQueries) {
      try {
        console.log(`Searching for: ${query}`);
        
        const response = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query,
            limit: 5,
          }),
        });

        if (!response.ok) {
          console.error(`Search failed for ${query}:`, response.status);
          continue;
        }

        const data = await response.json();
        console.log(`Found ${data.data?.length || 0} results for: ${query}`);

        if (data.data && Array.isArray(data.data)) {
          for (const result of data.data) {
            const patterns: string[] = [];
            const strategies: string[] = [];
            const insights: string[] = [];

            // Extract patterns from markdown content
            if (result.markdown) {
              const content = result.markdown.toLowerCase();
              
              // Extract pattern mentions
              const patternMatches = content.match(/pattern[s]?:?\s*[^\n.]+/gi) || [];
              patterns.push(...patternMatches.slice(0, 5));
              
              // Extract strategy mentions
              const strategyMatches = content.match(/strateg[y|ies]?:?\s*[^\n.]+/gi) || [];
              strategies.push(...strategyMatches.slice(0, 5));
              
              // Extract betting tips
              const tipMatches = content.match(/(tip|advice|recommend)[s]?:?\s*[^\n.]+/gi) || [];
              insights.push(...tipMatches.slice(0, 5));

              // Extract percentage/probability mentions
              const probMatches = content.match(/(\d+%|\d+\.\d+%)[^\n.]+/gi) || [];
              insights.push(...probMatches.slice(0, 3));
            }

            if (patterns.length > 0 || strategies.length > 0 || insights.length > 0) {
              allResults.push({
                source: result.url || 'unknown',
                patterns,
                strategies,
                insights,
                timestamp: new Date(),
              });

              allInsights.push(...insights);
              allStrategies.push(...strategies);
            }
          }
        }
      } catch (e) {
        console.error(`Error searching ${query}:`, e);
      }
    }

    // Store research results in learned_patterns
    const uniqueInsights = [...new Set(allInsights)].slice(0, 20);
    const uniqueStrategies = [...new Set(allStrategies)].slice(0, 20);

    // Save to database for future use
    if (uniqueInsights.length > 0 || uniqueStrategies.length > 0) {
      try {
        await supabase
          .from('learned_patterns')
          .upsert({
            pattern_type: 'web_research',
            pattern_key: 'web_research:latest',
            pattern_data: {
              insights: uniqueInsights,
              strategies: uniqueStrategies,
              sources: allResults.map(r => r.source),
              researchedAt: new Date().toISOString(),
            },
            times_seen: 1,
            times_correct: 0,
            success_rate: 0,
          }, {
            onConflict: 'pattern_key',
          });
        
        console.log('Research results saved to database');
      } catch (dbError) {
        console.error('Error saving research:', dbError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results: allResults.length,
        insights: uniqueInsights,
        strategies: uniqueStrategies,
        sources: allResults.map(r => r.source),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in pattern research:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
