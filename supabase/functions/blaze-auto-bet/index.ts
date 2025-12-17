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

    const baseHeaders = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Origin': 'https://blaze.bet.br',
      'Referer': 'https://blaze.bet.br/',
    };

    let response: BlazeResponse = { success: false, error: 'Ação não processada' };

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
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        try {
          // First, get wallet info to get wallet_id
          let walletId = null;
          try {
            const walletRes = await fetch('https://blaze.bet.br/api/wallets', {
              method: 'GET',
              headers: baseHeaders,
              signal: controller.signal,
            });
            
            if (walletRes.ok) {
              const walletData = await walletRes.json();
              console.log('Wallet data for bet:', JSON.stringify(walletData).substring(0, 300));
              
              if (Array.isArray(walletData) && walletData.length > 0) {
                // Find BRL wallet
                const brlWallet = walletData.find((w: any) => w.currency_type === 'BRL' || w.primary === true) || walletData[0];
                walletId = brlWallet?.id;
                console.log('Using wallet_id:', walletId);
              }
            }
          } catch (e) {
            console.log('Failed to get wallet:', e);
          }

          // Get current game
          let gameId = null;
          let gameStatus = null;
          
          const gameRes = await fetch('https://blaze.bet.br/api/singleplayer-originals/originals/roulette_games/current/1', {
            method: 'GET',
            headers: baseHeaders,
            signal: controller.signal,
          });
          
          if (gameRes.ok) {
            const data = await gameRes.json();
            gameId = data.id;
            gameStatus = data.status;
            console.log(`Current game: ${gameId}, status: ${gameStatus}`);
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
          
          // Try different bet payloads with wallet_id
          const betPayloads = [
            // With wallet_id (most likely correct)
            { amount: body.amount, color: colorCode, wallet_id: walletId, currency_type: 'BRL' },
            { amount: body.amount, color: colorCode, game_id: gameId, wallet_id: walletId },
            { amount: body.amount, color: colorCode, game_id: gameId, wallet_id: walletId, currency_type: 'BRL' },
            { amount: String(body.amount), color: colorCode, game_id: gameId, wallet_id: walletId },
            // Without wallet_id as fallback
            { amount: body.amount, color: colorCode, game_id: gameId },
            { amount: body.amount, color: colorCode },
          ];
          
          const betEndpoints = [
            'https://blaze.bet.br/api/singleplayer-originals/originals/roulette_bets',
          ];
          
          let betSuccess = false;
          let lastError = '';
          
          for (const betEndpoint of betEndpoints) {
            for (const payload of betPayloads) {
              // Skip payloads with null wallet_id
              if (payload.wallet_id === null) {
                const cleanPayload = { ...payload };
                delete cleanPayload.wallet_id;
                console.log(`Trying ${betEndpoint} with:`, JSON.stringify(cleanPayload));
                
                try {
                  const betRes = await fetch(betEndpoint, {
                    method: 'POST',
                    headers: baseHeaders,
                    body: JSON.stringify(cleanPayload),
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
                  console.log(`Bet request failed:`, e);
                  lastError = String(e);
                }
              } else {
                console.log(`Trying ${betEndpoint} with:`, JSON.stringify(payload));
                
                try {
                  const betRes = await fetch(betEndpoint, {
                    method: 'POST',
                    headers: baseHeaders,
                    body: JSON.stringify(payload),
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
                  console.log(`Bet request failed:`, e);
                  lastError = String(e);
                }
              }
            }
            
            if (betSuccess) break;
          }
          
          if (!betSuccess) {
            clearTimeout(timeoutId);
            response = { 
              success: false, 
              error: `Todas as tentativas falharam. Último erro: ${lastError.substring(0, 200)}` 
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
