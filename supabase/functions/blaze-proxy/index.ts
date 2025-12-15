import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Updated Blaze API endpoints (blaze.bet.br)
const getHistoryUrl = () => {
  const date = new Date();
  const endDate = date.toISOString();
  
  date.setDate(date.getDate() - 1);
  const startDate = date.toISOString();
  
  return `https://blaze.bet.br/api/singleplayer-originals/originals/roulette_games/recent/history/1?startDate=${startDate}&endDate=${endDate}&page=1`;
};

// Alternative endpoints to try
const BLAZE_ENDPOINTS = [
  () => getHistoryUrl(),
  () => 'https://blaze.bet.br/api/roulette_games/recent',
  () => 'https://blaze1.space/api/roulette_games/recent',
  () => 'https://api-v2.blaze.com/roulette_games/recent',
];

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let data = null;
    let lastError = null;

    // Try each endpoint until one works
    for (const getUrl of BLAZE_ENDPOINTS) {
      const url = getUrl();
      console.log(`Trying Blaze endpoint: ${url}`);

      try {
        // Add timeout to prevent hanging connections
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
        
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://blaze.bet.br/',
            'Origin': 'https://blaze.bet.br',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          },
        });
        
        clearTimeout(timeoutId);

        if (response.ok) {
          const jsonData = await response.json();
          console.log(`Success from ${url}:`, JSON.stringify(jsonData).substring(0, 200));
          
          // Handle different response formats
          if (jsonData.records && Array.isArray(jsonData.records)) {
            data = jsonData.records;
          } else if (Array.isArray(jsonData)) {
            data = jsonData;
          } else if (jsonData.data && Array.isArray(jsonData.data)) {
            data = jsonData.data;
          } else {
            data = [jsonData];
          }
          
          if (data && data.length > 0) {
            console.log(`Got ${data.length} records from ${url}`);
            break;
          }
        } else {
          console.log(`Failed ${url}: ${response.status} ${response.statusText}`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.log(`Error with ${url}:`, errorMessage);
        lastError = errorMessage;
      }
    }

    if (!data || data.length === 0) {
      console.log('All endpoints failed, returning error');
      return new Response(
        JSON.stringify({ 
          error: 'Could not fetch data from any Blaze endpoint',
          lastError: lastError,
          success: false 
        }),
        { 
          status: 503, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Normalize the data format
    const normalizedData = data.map((item: any) => ({
      id: item.id || item.uuid || crypto.randomUUID(),
      color: typeof item.color === 'number' ? item.color : 
             item.color === 'white' ? 0 : 
             item.color === 'red' ? 1 : 
             item.color === 'black' ? 2 : item.color,
      roll: item.roll || item.number || 0,
      created_at: item.created_at || item.createdAt || new Date().toISOString(),
    }));

    return new Response(JSON.stringify(normalizedData), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Error in blaze-proxy:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
