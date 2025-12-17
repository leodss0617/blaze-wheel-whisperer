import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BetRequest {
  action: 'place_bet' | 'check_balance' | 'get_game_status';
  color?: 'red' | 'black'; // 1 = red, 2 = black
  amount?: number;
  token?: string; // Allow token to be passed in request
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
    const body: BetRequest = await req.json();
    console.log('Received request:', body.action);

    // Token can come from request body OR environment variable
    const authToken = body.token || Deno.env.get('BLAZE_AUTH_TOKEN');
    
    if (!authToken) {
      console.error('No auth token available');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Token de autenticação não configurado. Cole seu token JWT nas configurações.',
          needsToken: true 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Headers that mimic a real browser on the BR site
    const baseHeaders: Record<string, string> = {
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'https://blaze.bet.br',
      'Referer': 'https://blaze.bet.br/pt/games/double',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'X-Language': 'pt',
      'X-Site': 'br',
    };

    let response: BlazeResponse = { success: false, error: 'Ação não processada' };

    switch (body.action) {
      case 'check_balance': {
        console.log('Checking balance...');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        try {
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
            
            if (Array.isArray(walletData) && walletData.length > 0) {
              const brlWallet = walletData.find((w: any) => w.currency_type === 'BRL' || w.primary === true) || walletData[0];
              const balanceStr = brlWallet?.real_balance || brlWallet?.balance || '0';
              balance = parseFloat(balanceStr) || 0;
              console.log('Balance from wallets array (parsed):', balance);
            } else if (walletData && (walletData.balance !== undefined)) {
              balance = parseFloat(walletData.balance) || 0;
              console.log('Balance from wallet object (parsed):', balance);
            }
          } else {
            console.log('Wallet endpoint failed, trying user data...');
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
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        try {
          // Get current game info including room_id
          let gameId = null;
          let gameStatus = null;
          let roomId = 1; // Default to BR room
          
          const gameRes = await fetch('https://blaze.bet.br/api/singleplayer-originals/originals/roulette_games/current/1', {
            method: 'GET',
            headers: baseHeaders,
            signal: controller.signal,
          });
          
          if (gameRes.ok) {
            const data = await gameRes.json();
            gameId = data.id;
            gameStatus = data.status;
            roomId = data.room_id || 1;
            console.log(`Current game: ${gameId}, status: ${gameStatus}, room: ${roomId}`);
          }
          
          if (!gameId) {
            clearTimeout(timeoutId);
            response = { success: false, error: 'Não foi possível encontrar jogo atual' };
            break;
          }
          
          // Check if betting is open
          const validStatuses = ['waiting', 'bet', 'betting', 'open', 'graphing'];
          if (!validStatuses.includes(gameStatus)) {
            clearTimeout(timeoutId);
            console.log(`Betting closed. Status: ${gameStatus}`);
            response = { 
              success: false, 
              error: `Apostas não abertas. Status: ${gameStatus}`,
              retryAfter: 5
            };
            break;
          }
          
          // Try multiple payload formats
          const payloads = [
            // Simple format (most common)
            { amount: Number(body.amount), color: colorCode },
            // With room_id
            { amount: Number(body.amount), color: colorCode, room_id: roomId },
            // With free_bet false
            { amount: Number(body.amount), color: colorCode, free_bet: false },
            // String amount
            { amount: String(body.amount), color: colorCode },
          ];
          
          let betSuccess = false;
          let lastError = '';
          
          for (const payload of payloads) {
            console.log('Trying payload:', JSON.stringify(payload));
            
            try {
              const betRes = await fetch('https://blaze.bet.br/api/singleplayer-originals/originals/roulette_bets', {
                method: 'POST',
                headers: baseHeaders,
                body: JSON.stringify(payload),
                signal: controller.signal,
              });
              
              const betText = await betRes.text();
              console.log(`Response ${betRes.status}:`, betText.substring(0, 300));
              
              if (betRes.ok || betRes.status === 201) {
                let betData;
                try {
                  betData = JSON.parse(betText);
                } catch {
                  betData = { raw: betText };
                }
                
                console.log('BET SUCCESS!', betData);
                betSuccess = true;
                clearTimeout(timeoutId);
                response = { 
                  success: true, 
                  data: {
                    bet_id: betData.id || 'placed',
                    amount: body.amount,
                    color: body.color,
                    game_id: gameId,
                  }
                };
                break;
              } else {
                lastError = betText;
              }
            } catch (e) {
              console.log('Request failed:', e);
              lastError = String(e);
            }
          }
          
          if (!betSuccess) {
            clearTimeout(timeoutId);
            
            // Parse and improve error message
            let errorMsg = lastError;
            try {
              const errorData = JSON.parse(lastError);
              if (errorData.error?.message) {
                errorMsg = errorData.error.message;
                
                if (errorData.error.code === 4013) {
                  // This error means the API isn't accepting bets from this token/region
                  // The user should use the Chrome extension instead
                  errorMsg = 'API bloqueou apostas diretas. Use a extensão Chrome para apostar automaticamente no navegador.';
                } else if (errorData.error.code === 4001) {
                  errorMsg = 'Saldo insuficiente para esta aposta.';
                } else if (errorData.error.code === 4002) {
                  errorMsg = 'Valor de aposta inválido (mínimo R$1).';
                } else if (errorData.error.code === 4005) {
                  errorMsg = 'Apostas encerradas para esta rodada.';
                }
              }
            } catch {
              // Keep raw error
            }
            
            response = { 
              success: false, 
              error: errorMsg,
            };
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);
          console.error('Bet error:', fetchError);
          response = { success: false, error: `Erro de conexão: ${fetchError}` };
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
