// Blaze Auto Bet - Bridge Script
// Este script roda no app Lovable e envia sinais para a extensão via chrome.storage

(function() {
  'use strict';

  const DEBUG = true;
  const log = (...args) => DEBUG && console.log('🌉 [Bridge]', ...args);
  const error = (...args) => console.error('🌉 [Bridge]', ...args);

  log('Bridge script carregado no app Lovable');
  log('URL:', window.location.href);

  // Marcar extensão como instalada
  try {
    localStorage.setItem('blaze-extension-installed', 'true');
    localStorage.setItem('blaze-extension-version', '1.2.0');
  } catch (e) {}

  // Keys for localStorage signals from the app
  const SIGNAL_KEYS = {
    BET: 'blaze-auto-bet-signal',
    WHITE_PROTECTION: 'blaze-white-protection-signal',
    EXTENSION_STATUS: 'blaze-extension-status'
  };

  // Listen for localStorage changes (signals from the React app)
  const processLocalStorageSignal = (key, value) => {
    if (!value) return;

    try {
      const signal = JSON.parse(value);
      log('📤 Sinal detectado no localStorage:', key, signal);

      // Send to background script which will relay to content script on Blaze
      chrome.runtime.sendMessage({
        type: key === SIGNAL_KEYS.WHITE_PROTECTION ? 'WHITE_PROTECTION_SIGNAL' : 'BET_SIGNAL',
        data: signal,
        timestamp: Date.now()
      }, (response) => {
        if (chrome.runtime.lastError) {
          error('Erro ao enviar para background:', chrome.runtime.lastError);
        } else {
          log('✅ Sinal enviado para background script:', response);
          // Show confirmation in app
          showNotification(`Sinal enviado: ${signal.color?.toUpperCase() || '?'}`, 'success');
        }
      });

      // Clear the signal from localStorage
      localStorage.removeItem(key);
    } catch (e) {
      error('Erro ao processar sinal:', e);
    }
  };

  // Watch for localStorage changes
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = function(key, value) {
    originalSetItem.apply(this, arguments);
    
    if (key === SIGNAL_KEYS.BET || key === SIGNAL_KEYS.WHITE_PROTECTION) {
      log('📝 localStorage.setItem interceptado:', key);
      setTimeout(() => processLocalStorageSignal(key, value), 50);
    }
  };

  // Also listen for storage events (from other tabs/frames)
  window.addEventListener('storage', (event) => {
    if (event.key === SIGNAL_KEYS.BET || event.key === SIGNAL_KEYS.WHITE_PROTECTION) {
      log('📦 Storage event detectado:', event.key);
      processLocalStorageSignal(event.key, event.newValue);
    }
  });

  // Listen for postMessage (alternative signal method)
  window.addEventListener('message', (event) => {
    if (event.data && (event.data.type === 'BET_SIGNAL' || event.data.type === 'WHITE_PROTECTION_SIGNAL')) {
      log('📨 PostMessage recebido:', event.data);
      
      chrome.runtime.sendMessage({
        type: event.data.type,
        data: event.data.data,
        timestamp: Date.now()
      }, (response) => {
        if (chrome.runtime.lastError) {
          error('Erro ao enviar para background:', chrome.runtime.lastError);
        } else {
          log('✅ Sinal via postMessage enviado:', response);
        }
      });
    }
  });

  // Listen for status updates from the extension
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    log('📥 Mensagem recebida do background:', message);

    if (message.type === 'EXTENSION_STATUS') {
      // Save to localStorage for the React app to read
      try {
        localStorage.setItem(SIGNAL_KEYS.EXTENSION_STATUS, JSON.stringify(message.data));
        // Also dispatch a custom event for the app
        window.dispatchEvent(new CustomEvent('blaze-extension-status', { detail: message.data }));
      } catch (e) {}
      sendResponse({ received: true });
    }

    if (message.type === 'BET_RESULT') {
      // Notify app about bet result
      try {
        localStorage.setItem('blaze-bet-result', JSON.stringify(message.data));
        window.dispatchEvent(new CustomEvent('blaze-bet-result', { detail: message.data }));
        showNotification(message.data.success ? 'Aposta realizada!' : 'Falha na aposta', message.data.success ? 'success' : 'error');
      } catch (e) {}
      sendResponse({ received: true });
    }

    return true;
  });

  // Request current status from extension
  function requestStatus() {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
      if (chrome.runtime.lastError) {
        log('Extensão não conectada ainda');
        return;
      }
      log('Status recebido:', response);
      if (response) {
        try {
          localStorage.setItem(SIGNAL_KEYS.EXTENSION_STATUS, JSON.stringify(response));
        } catch (e) {}
      }
    });
  }

  // Show notification in the app
  function showNotification(message, type = 'info') {
    try {
      // Try to use the app's toast system
      const event = new CustomEvent('blaze-notification', { 
        detail: { message, type } 
      });
      window.dispatchEvent(event);
    } catch (e) {}

    // Also log to console
    log(`📢 ${type.toUpperCase()}: ${message}`);
  }

  // Check for existing signals on page load
  function checkExistingSignals() {
    const betSignal = localStorage.getItem(SIGNAL_KEYS.BET);
    const whiteSignal = localStorage.getItem(SIGNAL_KEYS.WHITE_PROTECTION);
    
    if (betSignal) {
      log('🔍 Sinal de aposta existente encontrado');
      processLocalStorageSignal(SIGNAL_KEYS.BET, betSignal);
    }
    if (whiteSignal) {
      log('🔍 Sinal de proteção existente encontrado');
      processLocalStorageSignal(SIGNAL_KEYS.WHITE_PROTECTION, whiteSignal);
    }
  }

  // Initialize
  setTimeout(() => {
    checkExistingSignals();
    requestStatus();
  }, 1000);

  // Periodic status check
  setInterval(requestStatus, 5000);

  // Notify that bridge is ready
  window.dispatchEvent(new CustomEvent('blaze-bridge-ready'));
  log('✅ Bridge pronto para receber sinais');
})();
