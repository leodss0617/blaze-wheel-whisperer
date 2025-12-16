// Blaze Auto Bet - Content Script
// Este script é injetado na página do Blaze para automatizar apostas

(function() {
  'use strict';

  // Estado da extensão
  let isEnabled = false;
  let currentBetAmount = 2.5;
  let currentColor = null;
  let isWaitingToBet = false;
  let lastBetTime = 0;
  let connectionStatus = 'disconnected';

  // Configurações
  const CONFIG = {
    minBetInterval: 5000, // 5 segundos entre apostas
    checkInterval: 500, // Verificar estado a cada 500ms
    maxRetries: 3,
  };

  // Criar painel de status na página
  function createStatusPanel() {
    const existingPanel = document.getElementById('blaze-autobet-panel');
    if (existingPanel) return;

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
    `;
    document.body.appendChild(panel);

    // Event listener para toggle
    document.getElementById('bap-toggle').addEventListener('click', toggleAutoBet);
  }

  function toggleAutoBet() {
    isEnabled = !isEnabled;
    const btn = document.getElementById('bap-toggle');
    btn.textContent = isEnabled ? 'ON' : 'OFF';
    btn.className = isEnabled ? 'bap-toggle bap-on' : 'bap-toggle';
    
    if (isEnabled) {
      addLog('✅ Automação ativada');
      connectToSignalServer();
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
  }

  // Funções de interação com a página Blaze
  function getBetInput() {
    // Tentar diferentes seletores para o input de aposta
    const selectors = [
      'input[data-testid="bet-input"]',
      'input[type="number"][placeholder*="Valor"]',
      '.bet-input input',
      'input.input-value',
      '.double-bet input[type="number"]',
      '.roulette input[type="number"]',
      '.game-double input',
    ];
    
    for (const selector of selectors) {
      const input = document.querySelector(selector);
      if (input) return input;
    }
    
    // Busca genérica
    const inputs = document.querySelectorAll('input[type="number"]');
    for (const input of inputs) {
      if (input.offsetParent !== null && input.closest('.bet, .double, .roulette, [class*="bet"]')) {
        return input;
      }
    }
    
    return null;
  }

  function getColorButton(color) {
    const colorClass = color === 'red' ? 'red' : 'black';
    const colorText = color === 'red' ? 'Vermelho' : 'Preto';
    
    // Tentar diferentes seletores
    const selectors = [
      `button[data-testid="${colorClass}-button"]`,
      `button.${colorClass}`,
      `.${colorClass}-button`,
      `button[class*="${colorClass}"]`,
      `.bet-button.${colorClass}`,
      `.double-bet-button.${colorClass}`,
    ];
    
    for (const selector of selectors) {
      const btn = document.querySelector(selector);
      if (btn && btn.offsetParent !== null) return btn;
    }
    
    // Busca por texto ou atributo
    const buttons = document.querySelectorAll('button, .bet-button, [role="button"]');
    for (const btn of buttons) {
      const text = btn.textContent?.toLowerCase() || '';
      const classes = btn.className?.toLowerCase() || '';
      
      if ((text.includes(colorText.toLowerCase()) || classes.includes(colorClass)) && 
          btn.offsetParent !== null) {
        return btn;
      }
    }
    
    return null;
  }

  function getConfirmButton() {
    const selectors = [
      'button[data-testid="confirm-bet"]',
      'button[type="submit"]',
      '.confirm-bet',
      'button.confirm',
      '.bet-confirm',
    ];
    
    for (const selector of selectors) {
      const btn = document.querySelector(selector);
      if (btn && btn.offsetParent !== null) return btn;
    }
    
    // Busca por texto
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent?.toLowerCase() || '';
      if ((text.includes('apostar') || text.includes('confirmar') || text.includes('bet')) &&
          btn.offsetParent !== null && !btn.disabled) {
        return btn;
      }
    }
    
    return null;
  }

  function isBettingOpen() {
    // Verificar se as apostas estão abertas
    const waitingIndicators = [
      '.waiting',
      '.bet-open',
      '[data-status="waiting"]',
      '.status-waiting',
    ];
    
    for (const selector of waitingIndicators) {
      if (document.querySelector(selector)) return true;
    }
    
    // Verificar se o botão de aposta está habilitado
    const betButton = getColorButton('red') || getColorButton('black');
    if (betButton && !betButton.disabled) {
      return true;
    }
    
    // Verificar texto na página
    const pageText = document.body.innerText?.toLowerCase() || '';
    if (pageText.includes('aguardando') || pageText.includes('waiting') || pageText.includes('faça sua aposta')) {
      return true;
    }
    
    return false;
  }

  async function placeBet(color, amount) {
    const now = Date.now();
    if (now - lastBetTime < CONFIG.minBetInterval) {
      addLog('⏳ Aguardando intervalo entre apostas...');
      return false;
    }

    if (!isBettingOpen()) {
      addLog('⚠️ Apostas fechadas, aguardando...');
      return false;
    }

    addLog(`🎯 Tentando apostar R$ ${amount.toFixed(2)} no ${color === 'red' ? 'VERMELHO' : 'PRETO'}...`);

    try {
      // 1. Definir valor da aposta
      const betInput = getBetInput();
      if (betInput) {
        betInput.focus();
        betInput.value = '';
        
        // Simular digitação
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(betInput, amount.toString());
        betInput.dispatchEvent(new Event('input', { bubbles: true }));
        betInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        await sleep(200);
      } else {
        addLog('⚠️ Input de valor não encontrado');
      }

      // 2. Clicar no botão da cor
      const colorButton = getColorButton(color);
      if (!colorButton) {
        addLog('❌ Botão de cor não encontrado');
        return false;
      }

      colorButton.click();
      await sleep(300);
      
      // 3. Confirmar aposta (se necessário)
      const confirmButton = getConfirmButton();
      if (confirmButton && confirmButton !== colorButton) {
        confirmButton.click();
        await sleep(200);
      }

      lastBetTime = now;
      addLog(`✅ Aposta realizada: R$ ${amount.toFixed(2)} no ${color === 'red' ? 'VERMELHO' : 'PRETO'}`);
      
      // Notificar background script
      chrome.runtime.sendMessage({
        type: 'BET_PLACED',
        data: { color, amount, timestamp: now }
      });

      return true;
    } catch (error) {
      addLog(`❌ Erro ao apostar: ${error.message}`);
      return false;
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Comunicação com o app
  let signalCheckInterval = null;

  function connectToSignalServer() {
    connectionStatus = 'connecting';
    updateStatus('Conectando...', null, currentBetAmount);
    
    // Verificar sinais via storage (comunicação entre extension e app)
    signalCheckInterval = setInterval(checkForSignals, CONFIG.checkInterval);
    
    // Também escutar mensagens do background script
    connectionStatus = 'connected';
    updateStatus('Conectado', null, currentBetAmount);
    addLog('🔗 Conectado ao sistema de sinais');
  }

  function disconnectFromSignalServer() {
    if (signalCheckInterval) {
      clearInterval(signalCheckInterval);
      signalCheckInterval = null;
    }
    connectionStatus = 'disconnected';
    updateStatus('Desconectado', null, currentBetAmount);
  }

  async function checkForSignals() {
    if (!isEnabled) return;
    
    try {
      // Verificar sinais no storage
      chrome.storage.local.get(['pendingSignal', 'betConfig'], async (result) => {
        if (result.pendingSignal) {
          const signal = result.pendingSignal;
          const config = result.betConfig || { amount: 2.5 };
          
          currentBetAmount = config.amount || 2.5;
          currentColor = signal.color;
          
          updateStatus('Conectado', signal.color === 'red' ? 'VERMELHO' : 'PRETO', currentBetAmount);
          
          if (signal.shouldBet && !isWaitingToBet) {
            isWaitingToBet = true;
            addLog(`📡 Sinal recebido: ${signal.color === 'red' ? 'VERMELHO' : 'PRETO'} (${signal.confidence}%)`);
            
            // Tentar apostar
            const success = await placeBet(signal.color, currentBetAmount);
            
            if (success) {
              // Limpar sinal após aposta bem sucedida
              chrome.storage.local.remove('pendingSignal');
            }
            
            isWaitingToBet = false;
          }
        }
      });
    } catch (error) {
      console.error('Erro ao verificar sinais:', error);
    }
  }

  // Escutar mensagens do background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'BET_SIGNAL') {
      if (!isEnabled) {
        sendResponse({ success: false, reason: 'Automação desativada' });
        return;
      }
      
      const { color, amount, confidence } = message.data;
      currentBetAmount = amount;
      currentColor = color;
      
      addLog(`📡 Sinal recebido: ${color === 'red' ? 'VERMELHO' : 'PRETO'} R$ ${amount} (${confidence}%)`);
      updateStatus('Conectado', color === 'red' ? 'VERMELHO' : 'PRETO', amount);
      
      placeBet(color, amount).then(success => {
        sendResponse({ success });
      });
      
      return true; // Keep message channel open for async response
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

  // Inicialização
  function init() {
    console.log('🤖 Blaze Auto Bet - Inicializando...');
    
    // Aguardar página carregar completamente
    setTimeout(() => {
      createStatusPanel();
      
      // Restaurar estado
      chrome.storage.local.get(['isEnabled', 'betConfig'], (result) => {
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
      
      addLog('🚀 Extensão carregada');
    }, 2000);
  }

  // Aguardar DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
