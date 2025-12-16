// Blaze Auto Bet - Content Script
// Este script é injetado na página do Blaze para automatizar apostas

(function() {
  'use strict';

  // Debug logging
  const DEBUG = true;
  const log = (...args) => DEBUG && console.log('🤖 [AutoBet]', ...args);
  const warn = (...args) => DEBUG && console.warn('🤖 [AutoBet]', ...args);
  const error = (...args) => console.error('🤖 [AutoBet]', ...args);

  log('Content script iniciando...');
  log('URL atual:', window.location.href);

  // Estado da extensão
  let isEnabled = false;
  let currentBetAmount = 2.5;
  let currentColor = null;
  let isWaitingToBet = false;
  let lastBetTime = 0;
  let connectionStatus = 'disconnected';
  let lastProcessedSignalTime = 0;

  // Configurações
  const CONFIG = {
    minBetInterval: 5000, // 5 segundos entre apostas
    checkInterval: 1000, // Verificar estado a cada 1 segundo
    maxRetries: 3,
    localStorageKey: 'blaze-auto-bet-signal',
  };

  // Criar painel de status na página
  function createStatusPanel() {
    log('Criando painel de status...');
    const existingPanel = document.getElementById('blaze-autobet-panel');
    if (existingPanel) {
      log('Painel já existe');
      return;
    }

    const panel = document.createElement('div');
    panel.id = 'blaze-autobet-panel';
    panel.innerHTML = `
      <div class="bap-header">
        <span class="bap-title">🤖 Auto Bet IA</span>
        <button class="bap-toggle" id="bap-toggle">OFF</button>
      </div>
      <div class="bap-status">
        <div class="bap-row">
          <span>Status:</span>
          <span id="bap-connection" class="bap-disconnected">Desconectado</span>
        </div>
        <div class="bap-row">
          <span>Próxima aposta:</span>
          <span id="bap-next-bet">-</span>
        </div>
        <div class="bap-row">
          <span>Valor:</span>
          <span id="bap-amount">R$ 0.00</span>
        </div>
      </div>
      <div class="bap-log" id="bap-log"></div>
      <div class="bap-debug">
        <button id="bap-test-signal" style="background:#333;color:#0f0;padding:4px 8px;margin-top:8px;border:1px solid #0f0;cursor:pointer;font-size:10px;">
          🧪 Testar Sinal
        </button>
        <button id="bap-check-elements" style="background:#333;color:#ff0;padding:4px 8px;margin-top:8px;margin-left:4px;border:1px solid #ff0;cursor:pointer;font-size:10px;">
          🔍 Debug UI
        </button>
      </div>
    `;
    document.body.appendChild(panel);
    log('Painel criado com sucesso');

    // Event listeners
    document.getElementById('bap-toggle').addEventListener('click', toggleAutoBet);
    document.getElementById('bap-test-signal').addEventListener('click', testSignal);
    document.getElementById('bap-check-elements').addEventListener('click', debugUI);
  }

  function testSignal() {
    log('🧪 Testando sinal manual...');
    addLog('🧪 Enviando sinal de teste...');
    
    const testData = {
      color: 'red',
      amount: 2.5,
      confidence: 85,
      galeLevel: 0,
      timestamp: Date.now()
    };
    
    // Salvar no localStorage para simular sinal do app
    localStorage.setItem(CONFIG.localStorageKey, JSON.stringify(testData));
    log('Sinal de teste salvo no localStorage:', testData);
    addLog('✅ Sinal de teste enviado - verifique o console');
  }

  function debugUI() {
    log('🔍 Debugando elementos da UI...');
    addLog('🔍 Verificando elementos...');
    
    // Verificar input de aposta
    const betInput = getBetInput();
    log('Input de aposta:', betInput ? '✅ Encontrado' : '❌ Não encontrado', betInput);
    addLog(`Input valor: ${betInput ? '✅' : '❌'}`);
    
    // Verificar botões de cor
    const redBtn = getColorButton('red');
    const blackBtn = getColorButton('black');
    log('Botão vermelho:', redBtn ? '✅ Encontrado' : '❌ Não encontrado', redBtn);
    log('Botão preto:', blackBtn ? '✅ Encontrado' : '❌ Não encontrado', blackBtn);
    addLog(`Btn vermelho: ${redBtn ? '✅' : '❌'} | Btn preto: ${blackBtn ? '✅' : '❌'}`);
    
    // Verificar botão de confirmação
    const confirmBtn = getConfirmButton();
    log('Botão confirmar:', confirmBtn ? '✅ Encontrado' : '❌ Não encontrado', confirmBtn);
    addLog(`Btn confirmar: ${confirmBtn ? '✅' : '❌'}`);
    
    // Verificar status de apostas
    const bettingOpen = isBettingOpen();
    log('Apostas abertas:', bettingOpen ? '✅ SIM' : '❌ NÃO');
    addLog(`Apostas abertas: ${bettingOpen ? '✅ SIM' : '❌ NÃO'}`);
    
    // Listar todos os buttons na página
    const allButtons = document.querySelectorAll('button');
    log(`Total de botões na página: ${allButtons.length}`);
    allButtons.forEach((btn, i) => {
      if (btn.offsetParent !== null) { // Visível
        log(`  Botão ${i}:`, btn.className, btn.textContent?.substring(0, 30));
      }
    });
    
    // Listar todos os inputs
    const allInputs = document.querySelectorAll('input');
    log(`Total de inputs na página: ${allInputs.length}`);
    allInputs.forEach((input, i) => {
      log(`  Input ${i}:`, input.type, input.className, input.placeholder);
    });
  }

  function toggleAutoBet() {
    isEnabled = !isEnabled;
    const btn = document.getElementById('bap-toggle');
    btn.textContent = isEnabled ? 'ON' : 'OFF';
    btn.className = isEnabled ? 'bap-toggle bap-on' : 'bap-toggle';
    
    log('Automação:', isEnabled ? 'ATIVADA' : 'DESATIVADA');
    
    if (isEnabled) {
      addLog('✅ Automação ativada');
      connectToSignalServer();
      // Marcar extensão como instalada para o app detectar
      localStorage.setItem('blaze-extension-installed', 'true');
    } else {
      addLog('⛔ Automação desativada');
      disconnectFromSignalServer();
    }
    
    // Salvar estado
    chrome.storage.local.set({ isEnabled });
  }

  function updateStatus(status, nextBet, amount) {
    const connEl = document.getElementById('bap-connection');
    const nextEl = document.getElementById('bap-next-bet');
    const amountEl = document.getElementById('bap-amount');
    
    if (connEl) {
      connEl.textContent = status;
      connEl.className = status === 'Conectado' ? 'bap-connected' : 'bap-disconnected';
    }
    if (nextEl && nextBet !== undefined) {
      nextEl.textContent = nextBet || '-';
      nextEl.style.color = nextBet === 'VERMELHO' ? '#ff4444' : nextBet === 'PRETO' ? '#333' : '#fff';
    }
    if (amountEl && amount !== undefined) {
      amountEl.textContent = `R$ ${amount.toFixed(2)}`;
    }
  }

  function addLog(message) {
    const logEl = document.getElementById('bap-log');
    if (!logEl) return;
    
    const time = new Date().toLocaleTimeString('pt-BR');
    const entry = document.createElement('div');
    entry.className = 'bap-log-entry';
    entry.innerHTML = `<span class="bap-log-time">[${time}]</span> ${message}`;
    logEl.insertBefore(entry, logEl.firstChild);
    
    // Limitar a 20 entradas
    while (logEl.children.length > 20) {
      logEl.removeChild(logEl.lastChild);
    }
    
    // Também logar no console
    log('UI Log:', message);
  }

  // Funções de interação com a página Blaze
  function getBetInput() {
    log('Procurando input de aposta...');
    
    // Tentar diferentes seletores para o input de aposta
    const selectors = [
      'input[data-testid="bet-input"]',
      'input[type="number"][placeholder*="Valor"]',
      'input[type="text"][placeholder*="R$"]',
      '.bet-input input',
      'input.input-value',
      '.double-bet input[type="number"]',
      '.roulette input[type="number"]',
      '.game-double input',
      'input[type="number"]',
      'input[inputmode="decimal"]',
      'input[inputmode="numeric"]',
    ];
    
    for (const selector of selectors) {
      const input = document.querySelector(selector);
      if (input && input.offsetParent !== null) {
        log(`  ✅ Input encontrado com seletor: ${selector}`);
        return input;
      }
    }
    
    // Busca genérica
    const inputs = document.querySelectorAll('input');
    for (const input of inputs) {
      if (input.offsetParent !== null && 
          (input.type === 'number' || input.type === 'text') &&
          (input.closest('.bet, .double, .roulette, [class*="bet"], [class*="game"]'))) {
        log('  ✅ Input encontrado via busca genérica');
        return input;
      }
    }
    
    warn('  ❌ Nenhum input de aposta encontrado');
    return null;
  }

  function getColorButton(color) {
    log(`Procurando botão ${color}...`);
    
    const colorClass = color === 'red' ? 'red' : 'black';
    const colorText = color === 'red' ? ['vermelho', 'red'] : ['preto', 'black'];
    
    // Tentar diferentes seletores
    const selectors = [
      `button[data-testid="${colorClass}-button"]`,
      `button.${colorClass}`,
      `.${colorClass}-button`,
      `button[class*="${colorClass}"]`,
      `.bet-button.${colorClass}`,
      `.double-bet-button.${colorClass}`,
      `[class*="${colorClass}"][role="button"]`,
      `div[class*="${colorClass}"][onclick]`,
    ];
    
    for (const selector of selectors) {
      const btn = document.querySelector(selector);
      if (btn && btn.offsetParent !== null) {
        log(`  ✅ Botão encontrado com seletor: ${selector}`);
        return btn;
      }
    }
    
    // Busca por texto ou atributo
    const elements = document.querySelectorAll('button, .bet-button, [role="button"], div[class*="color"], div[class*="button"]');
    for (const el of elements) {
      const text = (el.textContent || '').toLowerCase();
      const classes = (el.className || '').toLowerCase();
      const style = el.getAttribute('style') || '';
      
      // Verificar por texto ou classe
      const matchesText = colorText.some(t => text.includes(t));
      const matchesClass = classes.includes(colorClass);
      const matchesStyle = color === 'red' ? style.includes('red') || style.includes('#f') : style.includes('black') || style.includes('#0');
      
      if ((matchesText || matchesClass || matchesStyle) && el.offsetParent !== null) {
        log(`  ✅ Botão encontrado via busca por texto/classe`);
        return el;
      }
    }
    
    warn(`  ❌ Botão ${color} não encontrado`);
    return null;
  }

  function getConfirmButton() {
    log('Procurando botão de confirmação...');
    
    const selectors = [
      'button[data-testid="confirm-bet"]',
      'button[type="submit"]',
      '.confirm-bet',
      'button.confirm',
      '.bet-confirm',
      'button[class*="confirm"]',
      'button[class*="submit"]',
    ];
    
    for (const selector of selectors) {
      const btn = document.querySelector(selector);
      if (btn && btn.offsetParent !== null) {
        log(`  ✅ Botão confirmar encontrado: ${selector}`);
        return btn;
      }
    }
    
    // Busca por texto
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = (btn.textContent || '').toLowerCase();
      if ((text.includes('apostar') || text.includes('confirmar') || text.includes('bet') || text.includes('place')) &&
          btn.offsetParent !== null && !btn.disabled) {
        log('  ✅ Botão confirmar encontrado via texto');
        return btn;
      }
    }
    
    log('  ℹ️ Botão confirmar não encontrado (pode não ser necessário)');
    return null;
  }

  function isBettingOpen() {
    log('Verificando se apostas estão abertas...');
    
    // Verificar indicadores visuais
    const waitingIndicators = [
      '.waiting',
      '.bet-open',
      '[data-status="waiting"]',
      '.status-waiting',
      '[class*="waiting"]',
      '[class*="open"]',
    ];
    
    for (const selector of waitingIndicators) {
      if (document.querySelector(selector)) {
        log(`  ✅ Indicador encontrado: ${selector}`);
        return true;
      }
    }
    
    // Verificar se o botão de aposta está habilitado
    const betButton = getColorButton('red') || getColorButton('black');
    if (betButton && !betButton.disabled && !betButton.classList.contains('disabled')) {
      log('  ✅ Botão de aposta habilitado');
      return true;
    }
    
    // Verificar texto na página
    const pageText = (document.body.innerText || '').toLowerCase();
    if (pageText.includes('aguardando') || pageText.includes('waiting') || 
        pageText.includes('faça sua aposta') || pageText.includes('place your bet')) {
      log('  ✅ Texto indica apostas abertas');
      return true;
    }
    
    warn('  ⚠️ Não foi possível confirmar se apostas estão abertas');
    return false;
  }

  async function placeBet(color, amount) {
    log(`🎲 Iniciando aposta: ${color} R$ ${amount}`);
    
    const now = Date.now();
    if (now - lastBetTime < CONFIG.minBetInterval) {
      const wait = CONFIG.minBetInterval - (now - lastBetTime);
      addLog(`⏳ Aguardando ${Math.ceil(wait/1000)}s entre apostas...`);
      log(`  Aguardando intervalo: ${wait}ms`);
      return false;
    }

    if (!isBettingOpen()) {
      addLog('⚠️ Apostas fechadas, aguardando...');
      return false;
    }

    addLog(`🎯 Apostando R$ ${amount.toFixed(2)} no ${color === 'red' ? 'VERMELHO' : 'PRETO'}...`);

    try {
      // 1. Definir valor da aposta
      const betInput = getBetInput();
      if (betInput) {
        log('  Definindo valor no input...');
        betInput.focus();
        betInput.value = '';
        
        // Simular digitação
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(betInput, amount.toString());
        betInput.dispatchEvent(new Event('input', { bubbles: true }));
        betInput.dispatchEvent(new Event('change', { bubbles: true }));
        betInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        
        log('  ✅ Valor definido:', amount);
        await sleep(300);
      } else {
        warn('  ⚠️ Input de valor não encontrado, continuando...');
      }

      // 2. Clicar no botão da cor
      const colorButton = getColorButton(color);
      if (!colorButton) {
        addLog('❌ Botão de cor não encontrado');
        error('  ❌ Botão de cor não encontrado!');
        return false;
      }

      log('  Clicando no botão de cor...');
      colorButton.click();
      colorButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await sleep(400);
      
      // 3. Confirmar aposta (se necessário)
      const confirmButton = getConfirmButton();
      if (confirmButton && confirmButton !== colorButton) {
        log('  Clicando no botão de confirmação...');
        confirmButton.click();
        await sleep(300);
      }

      lastBetTime = now;
      addLog(`✅ Aposta realizada: R$ ${amount.toFixed(2)} no ${color === 'red' ? 'VERMELHO' : 'PRETO'}`);
      log('  ✅ Aposta concluída com sucesso!');
      
      // Notificar background script
      chrome.runtime.sendMessage({
        type: 'BET_PLACED',
        data: { color, amount, timestamp: now }
      });

      return true;
    } catch (err) {
      addLog(`❌ Erro ao apostar: ${err.message}`);
      error('  ❌ Erro ao apostar:', err);
      return false;
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Comunicação com o app
  let signalCheckInterval = null;
  let localStorageCheckInterval = null;

  function connectToSignalServer() {
    connectionStatus = 'connecting';
    updateStatus('Conectando...', null, currentBetAmount);
    log('Conectando ao sistema de sinais...');
    
    // Verificar sinais via chrome.storage
    signalCheckInterval = setInterval(checkForChromeStorageSignals, CONFIG.checkInterval);
    
    // Verificar sinais via localStorage (do app Lovable)
    localStorageCheckInterval = setInterval(checkForLocalStorageSignals, CONFIG.checkInterval);
    
    // Escutar eventos de storage
    window.addEventListener('storage', onStorageChange);
    
    // Escutar mensagens postMessage
    window.addEventListener('message', onPostMessage);
    
    connectionStatus = 'connected';
    updateStatus('Conectado', null, currentBetAmount);
    addLog('🔗 Conectado - Aguardando sinais');
    log('✅ Conectado ao sistema de sinais');
  }

  function disconnectFromSignalServer() {
    log('Desconectando do sistema de sinais...');
    
    if (signalCheckInterval) {
      clearInterval(signalCheckInterval);
      signalCheckInterval = null;
    }
    if (localStorageCheckInterval) {
      clearInterval(localStorageCheckInterval);
      localStorageCheckInterval = null;
    }
    
    window.removeEventListener('storage', onStorageChange);
    window.removeEventListener('message', onPostMessage);
    
    connectionStatus = 'disconnected';
    updateStatus('Desconectado', null, currentBetAmount);
  }

  function onStorageChange(event) {
    log('📦 Storage change detectado:', event.key);
    if (event.key === CONFIG.localStorageKey && event.newValue) {
      log('  ✅ Sinal detectado via storage event');
      processLocalStorageSignal(event.newValue);
    }
  }

  function onPostMessage(event) {
    if (event.data && event.data.type === 'BET_SIGNAL') {
      log('📨 PostMessage recebido:', event.data);
      addLog('📡 Sinal via postMessage');
      processSignal(event.data.data);
    }
  }

  function checkForLocalStorageSignals() {
    if (!isEnabled) return;
    
    try {
      const signalData = localStorage.getItem(CONFIG.localStorageKey);
      if (signalData) {
        log('📦 Verificando localStorage:', signalData);
        processLocalStorageSignal(signalData);
      }
    } catch (err) {
      error('Erro ao ler localStorage:', err);
    }
  }

  function processLocalStorageSignal(signalData) {
    try {
      const signal = JSON.parse(signalData);
      log('📥 Processando sinal localStorage:', signal);
      
      // Evitar processar o mesmo sinal
      if (signal.timestamp && signal.timestamp <= lastProcessedSignalTime) {
        log('  ⏭️ Sinal já processado, ignorando');
        return;
      }
      
      lastProcessedSignalTime = signal.timestamp || Date.now();
      processSignal(signal);
      
      // Limpar sinal após processar
      localStorage.removeItem(CONFIG.localStorageKey);
    } catch (err) {
      error('Erro ao processar sinal localStorage:', err);
    }
  }

  async function processSignal(signal) {
    if (!isEnabled) {
      log('⛔ Automação desativada, ignorando sinal');
      return;
    }
    
    if (!signal.color || (signal.color !== 'red' && signal.color !== 'black')) {
      warn('⚠️ Sinal inválido, cor não especificada:', signal);
      return;
    }
    
    log('🎯 Processando sinal:', signal);
    
    currentBetAmount = signal.amount || currentBetAmount;
    currentColor = signal.color;
    
    updateStatus('Conectado', signal.color === 'red' ? 'VERMELHO' : 'PRETO', currentBetAmount);
    addLog(`📡 Sinal: ${signal.color === 'red' ? 'VERMELHO' : 'PRETO'} R$${currentBetAmount} (${signal.confidence || '?'}%)`);
    
    if (!isWaitingToBet) {
      isWaitingToBet = true;
      
      // Tentar apostar
      const success = await placeBet(signal.color, currentBetAmount);
      
      if (!success) {
        // Tentar novamente após um delay
        log('  Tentando novamente em 2s...');
        await sleep(2000);
        await placeBet(signal.color, currentBetAmount);
      }
      
      isWaitingToBet = false;
    }
  }

  async function checkForChromeStorageSignals() {
    if (!isEnabled) return;
    
    try {
      chrome.storage.local.get(['pendingSignal', 'betConfig'], async (result) => {
        if (result.pendingSignal) {
          const signal = result.pendingSignal;
          const config = result.betConfig || { amount: 2.5 };
          
          log('📦 Sinal chrome.storage:', signal);
          
          currentBetAmount = signal.amount || config.amount || 2.5;
          
          if (signal.timestamp && signal.timestamp <= lastProcessedSignalTime) {
            return;
          }
          
          lastProcessedSignalTime = signal.timestamp || Date.now();
          
          if (signal.shouldBet) {
            await processSignal(signal);
            chrome.storage.local.remove('pendingSignal');
          }
        }
      });
    } catch (err) {
      error('Erro ao verificar chrome.storage:', err);
    }
  }

  // Escutar mensagens do background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    log('📨 Mensagem do background:', message);
    
    if (message.type === 'BET_SIGNAL') {
      if (!isEnabled) {
        sendResponse({ success: false, reason: 'Automação desativada' });
        return;
      }
      
      processSignal(message.data);
      sendResponse({ success: true });
      return true;
    }
    
    if (message.type === 'GET_STATUS') {
      sendResponse({
        isEnabled,
        connectionStatus,
        currentColor,
        currentBetAmount,
        isBettingOpen: isBettingOpen()
      });
    }
    
    if (message.type === 'TOGGLE') {
      toggleAutoBet();
      sendResponse({ isEnabled });
    }
  });

  // Escutar BroadcastChannel
  try {
    const channel = new BroadcastChannel('blaze-auto-bet');
    channel.onmessage = (event) => {
      log('📡 BroadcastChannel message:', event.data);
      if (event.data && event.data.type === 'BET_SIGNAL') {
        addLog('📡 Sinal via BroadcastChannel');
        processSignal(event.data.data);
      }
    };
    log('✅ BroadcastChannel configurado');
  } catch (err) {
    warn('BroadcastChannel não disponível:', err);
  }

  // Inicialização
  function init() {
    log('🚀 Inicializando extensão...');
    log('  URL:', window.location.href);
    log('  Timestamp:', new Date().toISOString());
    
    // Aguardar página carregar completamente
    setTimeout(() => {
      createStatusPanel();
      
      // Restaurar estado
      chrome.storage.local.get(['isEnabled', 'betConfig'], (result) => {
        log('  Config carregada:', result);
        
        if (result.betConfig) {
          currentBetAmount = result.betConfig.amount || 2.5;
        }
        
        if (result.isEnabled) {
          isEnabled = true;
          const btn = document.getElementById('bap-toggle');
          if (btn) {
            btn.textContent = 'ON';
            btn.className = 'bap-toggle bap-on';
          }
          connectToSignalServer();
        }
        
        updateStatus(isEnabled ? 'Conectado' : 'Desconectado', null, currentBetAmount);
      });
      
      addLog('🚀 Extensão carregada v1.1');
      log('✅ Extensão inicializada com sucesso');
      
      // Marcar extensão como instalada
      localStorage.setItem('blaze-extension-installed', 'true');
      log('  ✅ Marcado como instalada no localStorage');
      
    }, 2000);
  }

  // Aguardar DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
