import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Updated Blaze API endpoints (blaze.bet.br) - fetch up to 500 records
const getHistoryUrl = (page = 1) => {
  const date = new Date();
  const endDate = date.toISOString();
  
  // Go back 3 days for more history
  date.setDate(date.getDate() - 3);
  const startDate = date.toISOString();
  
  return `https://blaze.bet.br/api/singleplayer-originals/originals/roulette_games/recent/history/1?startDate=${startDate}&endDate=${endDate}&page=${page}`;
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
    let allData: any[] = [];
    let lastError = null;

    // Try to fetch multiple pages for more history
    for (let page = 1; page <= 5; page++) {
      let pageData = null;
      
      // Try each endpoint until one works for this page
      for (const getUrl of BLAZE_ENDPOINTS) {
        const url = getUrl instanceof Function && getUrl.length > 0 
          ? (getUrl as (page: number) => string)(page)
          : typeof getUrl === 'function' ? getUrl() : getUrl;
        
        console.log(`Trying Blaze endpoint (page ${page}): ${url}`);

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
              pageData = jsonData.records;
            } else if (Array.isArray(jsonData)) {
              pageData = jsonData;
            } else if (jsonData.data && Array.isArray(jsonData.data)) {
              pageData = jsonData.data;
            } else {
              pageData = [jsonData];
            }
            
            if (pageData && pageData.length > 0) {
              console.log(`Got ${pageData.length} records from ${url} (page ${page})`);
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
      
      if (pageData && pageData.length > 0) {
        allData = [...allData, ...pageData];
        console.log(`Total records so far: ${allData.length}`);
        
        // Stop if we have enough or if page returned less data (end of history)
        if (allData.length >= 500 || pageData.length < 50) {
          break;
        }
      } else {
        // No more data available
        break;
      }
    }

    if (!allData || allData.length === 0) {
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
    
    const data = allData;

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
