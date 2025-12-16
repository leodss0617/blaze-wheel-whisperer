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
  retryAfter?: number;
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
          // First try to get user data
          const userRes = await fetch('https://blaze.bet.br/api/users/me', {
            method: 'GET',
            headers: baseHeaders,
            signal: controller.signal,
          });
          
          if (!userRes.ok) {
            clearTimeout(timeoutId);
            const errorText = await userRes.text();
            console.error('User check failed:', userRes.status, errorText);
            response = { 
              success: false, 
              error: `Erro ao verificar usuário: ${userRes.status}` 
            };
            break;
          }
          
          const userData = await userRes.json();
          console.log('User keys:', Object.keys(userData).join(', '));
          
          // Try to get wallet data separately
          const walletRes = await fetch('https://blaze.bet.br/api/wallets', {
            method: 'GET',
            headers: baseHeaders,
            signal: controller.signal,
          });
          
          let balance = 0;
          let walletData = null;
          
          if (walletRes.ok) {
            walletData = await walletRes.json();
            console.log('Wallet response:', JSON.stringify(walletData).substring(0, 500));
            
            // Parse wallet data - balance comes as STRING, currency is currency_type
            if (Array.isArray(walletData) && walletData.length > 0) {
              // Find the main wallet (BRL) - field is currency_type not currency
              const brlWallet = walletData.find((w: any) => w.currency_type === 'BRL' || w.primary === true) || walletData[0];
              // Balance is a STRING, need to parse it
              const balanceStr = brlWallet?.real_balance || brlWallet?.balance || '0';
              balance = parseFloat(balanceStr) || 0;
              console.log('Balance from wallets array (parsed):', balance);
            } else if (walletData && (walletData.balance !== undefined)) {
              balance = parseFloat(walletData.balance) || 0;
              console.log('Balance from wallet object (parsed):', balance);
            }
          } else {
            console.log('Wallet endpoint failed, trying user data...');
            // Fallback to user data
            if (userData.wallet?.balance !== undefined) {
              balance = userData.wallet.balance;
            } else if (userData.balance !== undefined) {
              balance = userData.balance;
            }
          }
          
          clearTimeout(timeoutId);
          console.log('Final balance:', balance);
          
          response = { 
            success: true, 
            balance,
            data: {
              username: userData.username,
              email: userData.email,
              balance,
              walletData,
            }
          };
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
          // Use correct Blaze Double endpoint
          const gameRes = await fetch('https://blaze.bet.br/api/singleplayer-originals/originals/roulette_games/current/1', {
            method: 'GET',
            headers: baseHeaders,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          
          if (!gameRes.ok) {
            console.log('Game status response:', gameRes.status);
            response = { success: false, error: 'Erro ao buscar status do jogo' };
          } else {
            const gameData = await gameRes.json();
            console.log('Game status:', JSON.stringify(gameData).substring(0, 300));
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
        console.log(`Placing bet: R$ ${body.amount} on ${body.color} (code: ${colorCode})`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        try {
          // Use correct Blaze Double endpoint for current game
          const currentGameRes = await fetch('https://blaze.bet.br/api/singleplayer-originals/originals/roulette_games/current/1', {
            method: 'GET',
            headers: baseHeaders,
            signal: controller.signal,
          });
          
          if (!currentGameRes.ok) {
            clearTimeout(timeoutId);
            const errorText = await currentGameRes.text();
            console.error('Failed to get current game:', currentGameRes.status, errorText);
            response = { success: false, error: `Não foi possível obter jogo atual: ${currentGameRes.status}` };
            break;
          }
          
          const currentGame = await currentGameRes.json();
          console.log('Current game response:', JSON.stringify(currentGame).substring(0, 300));
          
          // Parse game ID and status - handle different response structures
          const gameId = currentGame.id || currentGame.game_id || currentGame.current?.id;
          const gameStatus = currentGame.status || currentGame.current?.status;
          
          console.log(`Game ID: ${gameId}, Status: ${gameStatus}`);
          
          if (!gameId) {
            clearTimeout(timeoutId);
            response = { success: false, error: 'Não foi possível obter ID do jogo' };
            break;
          }
          
          // Check if betting is open - status can be 'waiting', 'bet', 'betting', or similar
          const bettingStatuses = ['waiting', 'bet', 'betting', 'open'];
          if (gameStatus && !bettingStatuses.includes(gameStatus.toLowerCase())) {
            clearTimeout(timeoutId);
            console.log(`Betting closed. Status: ${gameStatus}`);
            response = { 
              success: false, 
              error: `Apostas não abertas. Status: ${gameStatus}`,
              retryAfter: 5 // Suggest retry after 5 seconds
            };
            break;
          }
          
          // Place the bet using correct endpoint
          const betPayload = {
            amount: String(body.amount), // Some APIs expect string
            color: colorCode,
            currency_type: 'BRL',
            free_bet: false,
          };
          
          console.log('Bet payload:', JSON.stringify(betPayload));
          
          // Try the singleplayer-originals bet endpoint
          const betRes = await fetch('https://blaze.bet.br/api/singleplayer-originals/originals/roulette_bets', {
            method: 'POST',
            headers: baseHeaders,
            body: JSON.stringify(betPayload),
            signal: controller.signal,
          });
          
          const betResponseText = await betRes.text();
          clearTimeout(timeoutId);
          
          console.log('Bet response:', betRes.status, betResponseText.substring(0, 500));
          
          if (!betRes.ok) {
            // Try alternative endpoint if first fails
            console.log('Trying alternative bet endpoint...');
            const altBetRes = await fetch('https://blaze.bet.br/api/roulette_bets', {
              method: 'POST',
              headers: baseHeaders,
              body: JSON.stringify({
                amount: body.amount,
                color: colorCode,
                game_id: gameId,
                free_bet: false,
              }),
            });
            
            if (!altBetRes.ok) {
              const altErrorText = await altBetRes.text();
              console.error('Alt bet also failed:', altBetRes.status, altErrorText);
              response = { 
                success: false, 
                error: `Erro ao apostar: ${betRes.status} - ${betResponseText.substring(0, 200)}` 
              };
            } else {
              const altBetData = await altBetRes.json();
              console.log('Alt bet placed successfully:', altBetData);
              response = { 
                success: true, 
                data: {
                  bet_id: altBetData.id,
                  amount: body.amount,
                  color: body.color,
                  game_id: gameId,
                }
              };
            }
          } else {
            let betData;
            try {
              betData = JSON.parse(betResponseText);
            } catch (e) {
              betData = { raw: betResponseText };
            }
            console.log('Bet placed successfully:', betData);
            response = { 
              success: true, 
              data: {
                bet_id: betData.id || 'unknown',
                amount: body.amount,
                color: body.color,
                game_id: gameId,
              }
            };
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);
          console.error('Bet error:', fetchError);
          response = { success: false, error: `Erro de conexão ao apostar: ${fetchError}` };
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
