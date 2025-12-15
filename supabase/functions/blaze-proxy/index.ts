import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Blaze Double API endpoint
const BLAZE_API_URL = 'https://blaze1.space/api/roulette_games/recent';
const BLAZE_CURRENT_URL = 'https://blaze1.space/api/roulette_games/current';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const endpoint = url.searchParams.get('endpoint') || 'recent';

    let apiUrl = BLAZE_API_URL;
    if (endpoint === 'current') {
      apiUrl = BLAZE_CURRENT_URL;
    }

    console.log(`Fetching from Blaze API: ${apiUrl}`);

    // Fetch data from Blaze API
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://blaze1.space/',
        'Origin': 'https://blaze1.space',
      },
    });

    if (!response.ok) {
      console.error(`Blaze API error: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to fetch from Blaze: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Received ${Array.isArray(data) ? data.length : 1} records from Blaze`);

    return new Response(JSON.stringify(data), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Error fetching Blaze data:', error);
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
