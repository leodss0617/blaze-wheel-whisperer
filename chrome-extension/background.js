// =====================================================
// BLAZE AUTO BET - BACKGROUND SERVICE WORKER
// =====================================================

// State
let state = {
  connected: false,
  serverUrl: '',
  webSocket: null,
  config: null,
  lastPrediction: null,
  pendingBet: null,
  reconnectAttempts: 0,
  maxReconnectAttempts: 5
};

// ==================== INITIALIZATION ====================

chrome.runtime.onInstalled.addListener(() => {
  console.log('🎯 Blaze Auto Bet Extension installed');
  loadConfig();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('🎯 Blaze Auto Bet Extension started');
  loadConfig();
});

// ==================== CONFIG ====================

async function loadConfig() {
  const result = await chrome.storage.local.get('blazeConfig');
  state.config = result.blazeConfig || getDefaultConfig();
  
  if (state.config.serverUrl) {
    state.serverUrl = state.config.serverUrl;
  }
}

function getDefaultConfig() {
  return {
    autoBetEnabled: false,
    galeEnabled: true,
    currentBankroll: 100,
    baseBet: 2,
    maxGales: 2,
    galeMultiplier: 2,
    stopWin: 50,
    stopLoss: 30,
    minConfidence: 70,
    serverUrl: ''
  };
}

// ==================== MESSAGE HANDLING ====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender, sendResponse) {
  console.log('📨 Background received:', message.type);
  
  switch (message.type) {
    case 'CONFIG_UPDATED':
      state.config = message.config;
      if (message.config.serverUrl !== state.serverUrl) {
        state.serverUrl = message.config.serverUrl;
        if (state.webSocket) {
          state.webSocket.close();
        }
      }
      sendResponse({ success: true });
      break;

    case 'CONNECT_SERVER':
      state.serverUrl = message.serverUrl;
      connectToServer();
      sendResponse({ success: true });
      break;

    case 'DISCONNECT_SERVER':
      if (state.webSocket) {
        state.webSocket.close();
      }
      state.connected = false;
      sendResponse({ success: true });
      break;

    case 'GET_STATUS':
      sendResponse({
        connected: state.connected,
        lastPrediction: state.lastPrediction,
        serverUrl: state.serverUrl
      });
      break;

    case 'PREDICTION_RECEIVED':
      handlePrediction(message.prediction);
      sendResponse({ success: true });
      break;

    case 'BET_RESULT':
      handleBetResult(message);
      sendResponse({ success: true });
      break;

    case 'GAME_STATUS':
      handleGameStatus(message.status);
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
}

// ==================== WEBSOCKET CONNECTION ====================

function connectToServer() {
  if (!state.serverUrl) {
    broadcastMessage({ type: 'ERROR', error: 'URL do servidor não definida' });
    return;
  }

  // Close existing connection
  if (state.webSocket) {
    state.webSocket.close();
  }

  const wsUrl = state.serverUrl.replace('https://', 'wss://').replace('http://', 'ws://');
  
  try {
    console.log('🔌 Connecting to:', wsUrl);
    state.webSocket = new WebSocket(wsUrl);

    state.webSocket.onopen = () => {
      console.log('✅ WebSocket connected');
      state.connected = true;
      state.reconnectAttempts = 0;
      
      broadcastMessage({ type: 'CONNECTION_STATUS', connected: true });
      
      // Send authentication
      sendToServer({
        type: 'AUTH',
        clientId: generateClientId()
      });
    };

    state.webSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };

    state.webSocket.onclose = () => {
      console.log('❌ WebSocket disconnected');
      state.connected = false;
      broadcastMessage({ type: 'CONNECTION_STATUS', connected: false });
      
      // Attempt reconnection
      attemptReconnect();
    };

    state.webSocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      broadcastMessage({ type: 'ERROR', error: 'Erro de conexão WebSocket' });
    };

  } catch (error) {
    console.error('Error creating WebSocket:', error);
    broadcastMessage({ type: 'ERROR', error: error.message });
  }
}

function attemptReconnect() {
  if (state.reconnectAttempts >= state.maxReconnectAttempts) {
    broadcastMessage({ type: 'ERROR', error: 'Máximo de tentativas de reconexão atingido' });
    return;
  }

  state.reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, state.reconnectAttempts), 30000);
  
  console.log(`🔄 Reconnecting in ${delay}ms (attempt ${state.reconnectAttempts})`);
  
  setTimeout(() => {
    if (!state.connected && state.serverUrl) {
      connectToServer();
    }
  }, delay);
}

function sendToServer(data) {
  if (state.webSocket && state.webSocket.readyState === WebSocket.OPEN) {
    state.webSocket.send(JSON.stringify(data));
  }
}

function handleServerMessage(data) {
  console.log('📩 Server message:', data.type);
  
  switch (data.type) {
    case 'PREDICTION':
      handlePrediction(data.prediction);
      break;

    case 'CONFIG_SYNC':
      // Sync config from server
      if (data.config) {
        state.config = { ...state.config, ...data.config };
        chrome.storage.local.set({ blazeConfig: state.config });
      }
      break;

    case 'COMMAND':
      handleServerCommand(data.command);
      break;

    case 'PING':
      sendToServer({ type: 'PONG' });
      break;

    default:
      console.log('Unknown server message:', data);
  }
}

function handleServerCommand(command) {
  switch (command) {
    case 'START_AUTO_BET':
      state.config.autoBetEnabled = true;
      chrome.storage.local.set({ blazeConfig: state.config });
      broadcastMessage({ type: 'LOG', text: 'Auto bet ativado pelo servidor', level: 'success' });
      break;

    case 'STOP_AUTO_BET':
      state.config.autoBetEnabled = false;
      chrome.storage.local.set({ blazeConfig: state.config });
      broadcastMessage({ type: 'LOG', text: 'Auto bet desativado pelo servidor', level: 'warning' });
      break;
  }
}

// ==================== PREDICTION HANDLING ====================

function handlePrediction(prediction) {
  console.log('🎯 New prediction:', prediction);
  state.lastPrediction = prediction;
  
  // Broadcast to popup and content script
  broadcastMessage({
    type: 'NEW_PREDICTION',
    prediction: prediction
  });

  // Check if we should place bet
  if (state.config && state.config.autoBetEnabled) {
    if (prediction.confidence >= state.config.minConfidence) {
      scheduleBet(prediction);
    } else {
      broadcastMessage({
        type: 'LOG',
        text: `Confiança baixa (${prediction.confidence}%), ignorando`,
        level: 'warning'
      });
    }
  }
}

function scheduleBet(prediction) {
  const currentGale = state.pendingBet ? state.pendingBet.galeLevel : 0;
  const betAmount = calculateBetAmount(currentGale);
  
  // Check if can afford bet
  if (betAmount > state.config.currentBankroll) {
    broadcastMessage({
      type: 'LOG',
      text: 'Banca insuficiente para aposta',
      level: 'error'
    });
    return;
  }

  // Check max gales
  if (currentGale > state.config.maxGales) {
    broadcastMessage({
      type: 'LOG',
      text: `Máximo de gales (${state.config.maxGales}) atingido`,
      level: 'warning'
    });
    state.pendingBet = null;
    return;
  }

  state.pendingBet = {
    color: prediction.color,
    amount: betAmount,
    galeLevel: currentGale,
    confidence: prediction.confidence,
    timestamp: Date.now()
  };

  // Send bet command to content script
  sendBetToContentScript(state.pendingBet);
}

function calculateBetAmount(galeLevel) {
  if (galeLevel === 0 || !state.config.galeEnabled) {
    return state.config.baseBet;
  }
  
  return state.config.baseBet * Math.pow(state.config.galeMultiplier, galeLevel);
}

async function sendBetToContentScript(bet) {
  try {
    const tabs = await chrome.tabs.query({
      url: ['*://blaze.bet.br/*', '*://blaze.bet/*', '*://blaze-4.com/*']
    });

    if (tabs.length === 0) {
      broadcastMessage({
        type: 'LOG',
        text: 'Nenhuma aba da Blaze encontrada',
        level: 'error'
      });
      return;
    }

    // Send to first Blaze tab
    chrome.tabs.sendMessage(tabs[0].id, {
      type: 'PLACE_BET',
      bet: bet
    });

    broadcastMessage({
      type: 'BET_PLACED',
      color: bet.color,
      amount: bet.amount,
      galeLevel: bet.galeLevel
    });

  } catch (error) {
    console.error('Error sending bet:', error);
    broadcastMessage({
      type: 'ERROR',
      error: `Erro ao enviar aposta: ${error.message}`
    });
  }
}

// ==================== BET RESULT HANDLING ====================

function handleBetResult(result) {
  const { won, actualColor, galeLevel } = result;
  
  if (!state.pendingBet) return;

  const bet = state.pendingBet;
  let profit;

  if (won) {
    profit = bet.amount * 2; // Standard payout
    state.pendingBet = null;
  } else {
    profit = -bet.amount;
    
    // Setup next gale if enabled
    if (state.config.galeEnabled && galeLevel < state.config.maxGales) {
      state.pendingBet.galeLevel = galeLevel + 1;
    } else {
      state.pendingBet = null;
    }
  }

  // Update config bankroll
  state.config.currentBankroll += profit;
  chrome.storage.local.set({ blazeConfig: state.config });

  // Broadcast result
  broadcastMessage({
    type: 'BET_RESULT',
    won: won,
    profit: profit,
    galeLevel: galeLevel,
    actualColor: actualColor
  });

  // Send to server for analytics
  sendToServer({
    type: 'BET_RESULT',
    won: won,
    profit: profit,
    galeLevel: galeLevel,
    prediction: bet,
    actualColor: actualColor,
    bankroll: state.config.currentBankroll
  });
}

// ==================== GAME STATUS ====================

function handleGameStatus(status) {
  // Forward game status to server
  sendToServer({
    type: 'GAME_STATUS',
    status: status
  });
}

// ==================== UTILITIES ====================

function generateClientId() {
  return 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

async function broadcastMessage(message) {
  // Send to popup
  try {
    chrome.runtime.sendMessage(message);
  } catch (e) {
    // Popup might not be open
  }

  // Send to all Blaze tabs
  try {
    const tabs = await chrome.tabs.query({
      url: ['*://blaze.bet.br/*', '*://blaze.bet/*', '*://blaze-4.com/*']
    });
    
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    });
  } catch (e) {
    // No tabs found
  }
}

// ==================== ALARMS FOR PERIODIC TASKS ====================

chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
chrome.alarms.create('checkConnection', { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // Keep service worker alive
    console.log('⏰ Keep alive ping');
  }
  
  if (alarm.name === 'checkConnection') {
    // Check WebSocket connection
    if (state.serverUrl && !state.connected) {
      console.log('🔄 Checking connection...');
      connectToServer();
    }
  }
});

// Initial config load
loadConfig();
