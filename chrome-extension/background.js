// Blaze Auto Bet - Background Service Worker

// Configuração do servidor de sinais (seu app Lovable)
const SIGNAL_SERVER_URL = 'https://e8f1d0bd-6f84-421e-8589-757dca588da9.lovableproject.com';

// Estado
let isConnected = false;
let lastSignal = null;

// Escutar mensagens da página web (seu app) via postMessage
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log('Mensagem externa recebida:', message);
  
  if (message.type === 'BET_SIGNAL') {
    handleBetSignal(message.data);
    sendResponse({ received: true });
  }
  
  if (message.type === 'PING') {
    sendResponse({ pong: true, version: '1.0.0' });
  }
});

// Escutar mensagens do content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'BET_PLACED') {
    console.log('Aposta realizada:', message.data);
    // Pode enviar notificação ou atualizar estado
  }
  
  if (message.type === 'GET_CONFIG') {
    chrome.storage.local.get(['betConfig'], (result) => {
      sendResponse(result.betConfig || { amount: 2.5, maxGales: 2 });
    });
    return true;
  }
});

// Processar sinal de aposta
async function handleBetSignal(signal) {
  console.log('Processando sinal:', signal);
  lastSignal = signal;
  
  // Salvar sinal no storage para o content script pegar
  await chrome.storage.local.set({
    pendingSignal: {
      color: signal.color,
      amount: signal.amount,
      confidence: signal.confidence,
      shouldBet: true,
      timestamp: Date.now()
    }
  });
  
  // Enviar para todas as tabs do Blaze
  const tabs = await chrome.tabs.query({
    url: ['*://blaze.bet.br/*', '*://blaze.com/*', '*://blaze1.space/*']
  });
  
  for (const tab of tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'BET_SIGNAL',
        data: signal
      });
    } catch (error) {
      console.log('Tab não disponível:', tab.id);
    }
  }
  
  // Mostrar notificação
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: '🎯 Sinal de Aposta!',
    message: `Apostar R$ ${signal.amount} no ${signal.color === 'red' ? 'VERMELHO' : 'PRETO'} (${signal.confidence}% confiança)`,
    priority: 2
  });
}

// Verificar sinais periodicamente do servidor (polling como fallback)
async function checkServerSignals() {
  try {
    const response = await fetch(`${SIGNAL_SERVER_URL}/api/signal`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.signal && data.signal !== lastSignal?.id) {
        handleBetSignal(data.signal);
      }
    }
  } catch (error) {
    // Servidor não disponível, ok
  }
}

// Inicialização
chrome.runtime.onInstalled.addListener(() => {
  console.log('Blaze Auto Bet instalado!');
  
  // Configuração padrão
  chrome.storage.local.set({
    betConfig: {
      amount: 2.5,
      maxGales: 2,
      stopLoss: 50,
      targetProfit: 30
    },
    isEnabled: false
  });
});

// Polling como fallback (a cada 5 segundos)
// setInterval(checkServerSignals, 5000);

console.log('Blaze Auto Bet - Background script carregado');
