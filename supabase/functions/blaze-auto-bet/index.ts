import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BetRequest {
  action: 'place_bet' | 'check_balance' | 'get_game_status';
  color?: 'red' | 'black'; // 1 = red, 2 = black
  amount?: number;
}

interface BlazeResponse {
  success: boolean;
  data?: any;
  error?: string;
  balance?: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authToken = Deno.env.get('BLAZE_AUTH_TOKEN');
    
    if (!authToken) {
      console.error('BLAZE_AUTH_TOKEN not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Token de autenticação não configurado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: BetRequest = await req.json();
    console.log('Received request:', body.action);

    const baseHeaders = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Origin': 'https://blaze.bet.br',
      'Referer': 'https://blaze.bet.br/',
    };

    let response: BlazeResponse;

    switch (body.action) {
      case 'check_balance': {
        console.log('Checking balance...');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        try {
          const balanceRes = await fetch('https://blaze.bet.br/api/users/me', {
            method: 'GET',
            headers: baseHeaders,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          
          if (!balanceRes.ok) {
            const errorText = await balanceRes.text();
            console.error('Balance check failed:', balanceRes.status, errorText);
            response = { 
              success: false, 
              error: `Erro ao verificar saldo: ${balanceRes.status}` 
            };
          } else {
            const userData = await balanceRes.json();
            console.log('User data received:', JSON.stringify(userData).substring(0, 200));
            response = { 
              success: true, 
              balance: userData.wallet?.balance || userData.balance || 0,
              data: {
                username: userData.username,
                email: userData.email,
                balance: userData.wallet?.balance || userData.balance || 0,
              }
            };
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);
          console.error('Fetch error:', fetchError);
          response = { success: false, error: 'Erro de conexão ao verificar saldo' };
        }
        break;
      }

      case 'get_game_status': {
        console.log('Getting game status...');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        try {
          const gameRes = await fetch('https://blaze.bet.br/api/roulette_games/current', {
            method: 'GET',
            headers: baseHeaders,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          
          if (!gameRes.ok) {
            response = { success: false, error: 'Erro ao buscar status do jogo' };
          } else {
            const gameData = await gameRes.json();
            console.log('Game status:', JSON.stringify(gameData).substring(0, 200));
            response = { success: true, data: gameData };
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);
          console.error('Fetch error:', fetchError);
          response = { success: false, error: 'Erro de conexão' };
        }
        break;
      }

      case 'place_bet': {
        if (!body.color || !body.amount) {
          response = { success: false, error: 'Cor e valor são obrigatórios' };
          break;
        }

        const colorCode = body.color === 'red' ? 1 : 2;
        console.log(`Placing bet: ${body.amount} on ${body.color} (code: ${colorCode})`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        try {
          // First get current game
          const currentGameRes = await fetch('https://blaze.bet.br/api/roulette_games/current', {
            method: 'GET',
            headers: baseHeaders,
            signal: controller.signal,
          });
          
          if (!currentGameRes.ok) {
            clearTimeout(timeoutId);
            response = { success: false, error: 'Não foi possível obter jogo atual' };
            break;
          }
          
          const currentGame = await currentGameRes.json();
          console.log('Current game:', currentGame.id, 'status:', currentGame.status);
          
          // Check if betting is open
          if (currentGame.status !== 'waiting') {
            clearTimeout(timeoutId);
            response = { 
              success: false, 
              error: `Apostas não abertas. Status: ${currentGame.status}` 
            };
            break;
          }
          
          // Place the bet
          const betRes = await fetch('https://blaze.bet.br/api/roulette_bets', {
            method: 'POST',
            headers: baseHeaders,
            body: JSON.stringify({
              amount: body.amount,
              color: colorCode,
              game_id: currentGame.id,
              free_bet: false,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          
          if (!betRes.ok) {
            const errorText = await betRes.text();
            console.error('Bet failed:', betRes.status, errorText);
            response = { 
              success: false, 
              error: `Erro ao apostar: ${betRes.status} - ${errorText}` 
            };
          } else {
            const betData = await betRes.json();
            console.log('Bet placed successfully:', betData);
            response = { 
              success: true, 
              data: {
                bet_id: betData.id,
                amount: body.amount,
                color: body.color,
                game_id: currentGame.id,
              }
            };
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);
          console.error('Bet error:', fetchError);
          response = { success: false, error: 'Erro de conexão ao apostar' };
        }
        break;
      }

      default:
        response = { success: false, error: 'Ação inválida' };
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in blaze-auto-bet:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
