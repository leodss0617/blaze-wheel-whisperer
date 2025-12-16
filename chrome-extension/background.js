// Blaze Auto Bet - Background Service Worker

// Debug logging
const DEBUG = true;
const log = (...args) => DEBUG && console.log('🤖 [Background]', ...args);
const error = (...args) => console.error('🤖 [Background]', ...args);

log('Background script iniciando...');

// Estado
let isConnected = false;
let lastSignal = null;
let lastSignalTime = 0;

// Escutar mensagens externas (de páginas web como o app Lovable)
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  log('📨 Mensagem externa recebida:', message, 'de:', sender.url);
  
  if (message.type === 'BET_SIGNAL') {
    handleBetSignal(message.data);
    sendResponse({ received: true, timestamp: Date.now() });
  }
  
  if (message.type === 'PING') {
    log('  PING recebido, enviando PONG');
    sendResponse({ pong: true, version: '1.1.0' });
  }
  
  return true;
});

// Escutar mensagens do content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log('📨 Mensagem do content script:', message, 'tab:', sender.tab?.id);
  
  if (message.type === 'BET_PLACED') {
    log('✅ Aposta realizada:', message.data);
  }
  
  if (message.type === 'GET_CONFIG') {
    chrome.storage.local.get(['betConfig'], (result) => {
      sendResponse(result.betConfig || { amount: 2.5, maxGales: 2 });
    });
    return true;
  }
  
  if (message.type === 'LOG') {
    log('📋 Log do content script:', message.data);
  }
});

// Processar sinal de aposta
async function handleBetSignal(signal) {
  log('🎯 Processando sinal:', signal);
  
  // Evitar sinais duplicados
  if (signal.timestamp && signal.timestamp <= lastSignalTime) {
    log('  ⏭️ Sinal duplicado, ignorando');
    return;
  }
  
  lastSignal = signal;
  lastSignalTime = signal.timestamp || Date.now();
  
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
  log('  ✅ Sinal salvo no chrome.storage');
  
  // Enviar para todas as tabs do Blaze
  const tabs = await chrome.tabs.query({
    url: ['*://blaze.bet.br/*', '*://blaze.com/*', '*://blaze1.space/*', '*://*.blaze.bet.br/*']
  });
  
  log(`  📡 Enviando para ${tabs.length} tabs do Blaze...`);
  
  for (const tab of tabs) {
    try {
      log(`    Enviando para tab ${tab.id}: ${tab.url}`);
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'BET_SIGNAL',
        data: signal
      });
      log(`    ✅ Resposta da tab ${tab.id}:`, response);
    } catch (err) {
      log(`    ⚠️ Tab ${tab.id} não respondeu:`, err.message);
    }
  }
  
  // Mostrar notificação
  try {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.svg',
      title: '🎯 Sinal de Aposta!',
      message: `Apostar R$ ${signal.amount} no ${signal.color === 'red' ? 'VERMELHO' : 'PRETO'} (${signal.confidence}% confiança)`,
      priority: 2
    });
    log('  ✅ Notificação criada');
  } catch (err) {
    log('  ⚠️ Erro ao criar notificação:', err.message);
  }
}

// Monitorar mudanças no localStorage das tabs (não é possível diretamente, mas podemos usar storage.local)
chrome.storage.onChanged.addListener((changes, namespace) => {
  log('📦 Storage mudou:', namespace, Object.keys(changes));
  
  if (namespace === 'local' && changes.pendingSignal) {
    log('  Sinal pendente atualizado:', changes.pendingSignal.newValue);
  }
});

// Inicialização
chrome.runtime.onInstalled.addListener((details) => {
  log('🚀 Extensão instalada!', details.reason);
  
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
  
  log('  ✅ Configuração padrão salva');
});

// Verificar conexão com tabs do Blaze periodicamente
setInterval(async () => {
  const tabs = await chrome.tabs.query({
    url: ['*://blaze.bet.br/*', '*://blaze.com/*', '*://blaze1.space/*']
  });
  
  if (tabs.length > 0) {
    log(`📊 ${tabs.length} tab(s) do Blaze ativa(s)`);
  }
}, 30000); // A cada 30 segundos

log('✅ Background script carregado com sucesso');
