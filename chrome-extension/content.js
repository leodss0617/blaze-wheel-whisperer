// =====================================================
// BLAZE AUTO BET - CONTENT SCRIPT
// Interage diretamente com a página da Blaze
// =====================================================

(function() {
  'use strict';

  console.log('🎯 Blaze Auto Bet Content Script loaded');

  // ==================== STATE ====================
  
  const state = {
    isDoubleGame: false,
    gameStatus: 'waiting', // waiting, rolling, betting
    lastRoundId: null,
    lastColor: null,
    jwtToken: null,
    bettingOpen: false,
    config: null,
    pendingBet: null,
    observer: null
  };

  // ==================== INITIALIZATION ====================

  function init() {
    console.log('🎮 Initializing content script...');
    
    // Check if we're on Double game page
    checkDoublePage();
    
    // Extract JWT token
    extractJWTToken();
    
    // Load config
    loadConfig();
    
    // Setup observers
    setupGameObserver();
    
    // Setup message listener
    setupMessageListener();
    
    // Inject UI overlay
    injectOverlay();
    
    // Start monitoring
    startMonitoring();
    
    console.log('✅ Content script initialized');
  }

  // ==================== PAGE DETECTION ====================

  function checkDoublePage() {
    const url = window.location.href;
    state.isDoubleGame = url.includes('/games/double') || 
                         url.includes('/double') ||
                         document.querySelector('[data-testid="roulette"]') !== null;
    
    console.log('📍 Is Double page:', state.isDoubleGame);
  }

  // ==================== JWT TOKEN ====================

  function extractJWTToken() {
    try {
      // Try different storage keys used by Blaze
      const tokenKeys = ['ACCESS_TOKEN', 'access_token', 'token', 'jwt', 'authToken'];
      
      for (const key of tokenKeys) {
        const token = window.localStorage.getItem(key);
        if (token && token.startsWith('eyJ')) {
          state.jwtToken = token;
          console.log('🔐 JWT Token found:', key);
          return;
        }
      }
      
      // Try sessionStorage
      for (const key of tokenKeys) {
        const token = window.sessionStorage.getItem(key);
        if (token && token.startsWith('eyJ')) {
          state.jwtToken = token;
          console.log('🔐 JWT Token found in session:', key);
          return;
        }
      }
      
      console.log('⚠️ JWT Token not found');
    } catch (error) {
      console.error('Error extracting token:', error);
    }
  }

  // ==================== CONFIG ====================

  async function loadConfig() {
    try {
      const result = await chrome.storage.local.get('blazeConfig');
      state.config = result.blazeConfig || {};
      console.log('⚙️ Config loaded:', state.config);
    } catch (error) {
      console.error('Error loading config:', error);
    }
  }

  // ==================== GAME OBSERVER ====================

  function setupGameObserver() {
    // Observer for game state changes
    const targetNode = document.body;
    
    const config = {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    };

    state.observer = new MutationObserver((mutations) => {
      checkGameState();
    });

    state.observer.observe(targetNode, config);
    console.log('👁️ Game observer started');
  }

  function checkGameState() {
    // Multiple selectors for different Blaze versions
    const selectors = {
      rolling: [
        '.roulette-rolling',
        '[class*="rolling"]',
        '.wheel-spinning',
        '[data-status="rolling"]'
      ],
      betting: [
        '.betting-open',
        '[class*="betting"]',
        '[data-status="waiting"]',
        '.timer-container'
      ],
      result: [
        '.result-color',
        '[class*="result"]',
        '.last-result',
        '.roulette-result'
      ],
      timer: [
        '.time-left',
        '[class*="timer"]',
        '.countdown',
        '.bet-timer'
      ]
    };

    // Check for betting phase
    const timerElement = findElement(selectors.timer);
    if (timerElement) {
      const timerText = timerElement.textContent;
      const timeMatch = timerText.match(/(\d+)/);
      if (timeMatch) {
        const seconds = parseInt(timeMatch[1]);
        if (seconds > 0 && state.gameStatus !== 'betting') {
          state.gameStatus = 'betting';
          state.bettingOpen = true;
          onBettingPhase(seconds);
        }
      }
    }

    // Check for rolling phase
    const rollingElement = findElement(selectors.rolling);
    if (rollingElement && state.gameStatus !== 'rolling') {
      state.gameStatus = 'rolling';
      state.bettingOpen = false;
      onRollingPhase();
    }

    // Check for result
    const resultElement = findElement(selectors.result);
    if (resultElement && state.gameStatus === 'rolling') {
      const color = extractResultColor(resultElement);
      if (color && color !== state.lastColor) {
        state.lastColor = color;
        state.gameStatus = 'waiting';
        onResult(color);
      }
    }
  }

  function findElement(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  }

  function extractResultColor(element) {
    const classList = element.className.toLowerCase();
    const text = element.textContent.toLowerCase();
    const style = element.getAttribute('style') || '';
    
    if (classList.includes('red') || text.includes('vermelho') || style.includes('red')) {
      return 'red';
    }
    if (classList.includes('black') || text.includes('preto') || style.includes('black') || style.includes('#000')) {
      return 'black';
    }
    if (classList.includes('white') || text.includes('branco') || style.includes('white') || text.includes('0')) {
      return 'white';
    }
    
    // Check for color number
    const number = parseInt(text);
    if (!isNaN(number)) {
      if (number === 0) return 'white';
      if (number >= 1 && number <= 7) return 'red';
      if (number >= 8 && number <= 14) return 'black';
    }
    
    return null;
  }

  // ==================== GAME EVENTS ====================

  function onBettingPhase(seconds) {
    console.log(`🎰 Betting phase started - ${seconds}s remaining`);
    
    sendToBackground({
      type: 'GAME_STATUS',
      status: {
        phase: 'betting',
        timeRemaining: seconds,
        timestamp: Date.now()
      }
    });

    // Execute pending bet if any
    if (state.pendingBet && seconds > 3) {
      executeBet(state.pendingBet);
    }
  }

  function onRollingPhase() {
    console.log('🎡 Rolling phase started');
    
    sendToBackground({
      type: 'GAME_STATUS',
      status: {
        phase: 'rolling',
        timestamp: Date.now()
      }
    });
  }

  function onResult(color) {
    console.log(`🎯 Result: ${color}`);
    
    sendToBackground({
      type: 'GAME_STATUS',
      status: {
        phase: 'result',
        color: color,
        timestamp: Date.now()
      }
    });

    // Check bet result if pending
    if (state.pendingBet) {
      const won = state.pendingBet.color === color || 
                  (color === 'white' && state.pendingBet.color !== 'white');
      
      sendToBackground({
        type: 'BET_RESULT',
        won: won,
        actualColor: color,
        galeLevel: state.pendingBet.galeLevel,
        prediction: state.pendingBet
      });

      state.pendingBet = null;
      updateOverlayStatus('Aguardando próxima previsão', 'waiting');
    }
  }

  // ==================== BETTING ====================

  async function executeBet(bet) {
    console.log('💰 Executing bet:', bet);
    updateOverlayStatus(`Apostando R$ ${bet.amount} no ${bet.color}...`, 'betting');

    if (!state.jwtToken) {
      extractJWTToken();
      if (!state.jwtToken) {
        console.error('❌ No JWT token available');
        updateOverlayStatus('Erro: Token não encontrado', 'error');
        return false;
      }
    }

    try {
      // Method 1: Direct API call
      const success = await placeBetViaAPI(bet);
      
      if (!success) {
        // Method 2: DOM manipulation (fallback)
        await placeBetViaDOM(bet);
      }

      state.pendingBet = bet;
      updateOverlayStatus(`Aposta colocada: ${bet.color.toUpperCase()} R$${bet.amount}`, 'success');
      return true;

    } catch (error) {
      console.error('❌ Error placing bet:', error);
      updateOverlayStatus(`Erro: ${error.message}`, 'error');
      return false;
    }
  }

  async function placeBetViaAPI(bet) {
    const colorMap = {
      'red': 1,
      'black': 2,
      'white': 0
    };

    const endpoints = [
      'https://blaze.bet.br/api/singleplayer-originals/originals/roulette/bet',
      'https://blaze.bet.br/api/roulette_bets',
      'https://blaze-4.com/api/singleplayer-originals/originals/roulette/bet'
    ];

    const payload = {
      amount: bet.amount,
      color: colorMap[bet.color],
      currency_type: 'BRL',
      wallet_id: 1
    };

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.jwtToken}`,
            'Accept': 'application/json',
            'Origin': window.location.origin,
            'Referer': window.location.href
          },
          body: JSON.stringify(payload),
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          console.log('✅ Bet placed via API:', data);
          return true;
        }

        const error = await response.json().catch(() => ({}));
        console.warn(`API ${endpoint} failed:`, error);

      } catch (error) {
        console.warn(`API ${endpoint} error:`, error.message);
      }
    }

    return false;
  }

  async function placeBetViaDOM(bet) {
    console.log('🖱️ Placing bet via DOM...');

    // Find bet amount input
    const amountInput = findElement([
      'input[data-testid="bet-amount"]',
      'input[name="amount"]',
      '.bet-input input',
      '.amount-input',
      'input[type="number"]'
    ]);

    if (amountInput) {
      // Clear and set amount
      amountInput.value = '';
      amountInput.focus();
      
      // Simulate typing
      for (const char of bet.amount.toString()) {
        amountInput.value += char;
        amountInput.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(50);
      }
      
      amountInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    await sleep(200);

    // Find and click color button
    const colorSelectors = {
      red: [
        '[data-testid="red-button"]',
        '.red-button',
        '.bet-button.red',
        'button[class*="red"]',
        '.color-red'
      ],
      black: [
        '[data-testid="black-button"]',
        '.black-button',
        '.bet-button.black',
        'button[class*="black"]',
        '.color-black'
      ],
      white: [
        '[data-testid="white-button"]',
        '.white-button',
        '.bet-button.white',
        'button[class*="white"]',
        '.color-white'
      ]
    };

    const colorButton = findElement(colorSelectors[bet.color]);
    
    if (colorButton) {
      colorButton.click();
      console.log('✅ Bet placed via DOM');
      return true;
    }

    throw new Error('Não foi possível encontrar botões de aposta');
  }

  // ==================== MESSAGE HANDLING ====================

  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      handleMessage(message, sendResponse);
      return true;
    });
  }

  function handleMessage(message, sendResponse) {
    console.log('📨 Content script received:', message.type);

    switch (message.type) {
      case 'TEST_CONNECTION':
        sendResponse({
          success: true,
          hasToken: !!state.jwtToken,
          isDoublePage: state.isDoubleGame,
          gameStatus: state.gameStatus
        });
        break;

      case 'PLACE_BET':
        state.pendingBet = message.bet;
        if (state.bettingOpen) {
          executeBet(message.bet);
        }
        sendResponse({ success: true, queued: !state.bettingOpen });
        break;

      case 'NEW_PREDICTION':
        updateOverlayPrediction(message.prediction);
        sendResponse({ success: true });
        break;

      case 'CONFIG_UPDATED':
        state.config = message.config;
        sendResponse({ success: true });
        break;

      case 'GET_GAME_STATUS':
        sendResponse({
          isDoublePage: state.isDoubleGame,
          gameStatus: state.gameStatus,
          bettingOpen: state.bettingOpen,
          lastColor: state.lastColor,
          hasToken: !!state.jwtToken
        });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown message' });
    }
  }

  function sendToBackground(message) {
    try {
      chrome.runtime.sendMessage(message);
    } catch (error) {
      console.error('Error sending to background:', error);
    }
  }

  // ==================== UI OVERLAY ====================

  function injectOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'blaze-autobet-overlay';
    overlay.innerHTML = `
      <div class="bab-container">
        <div class="bab-header">
          <span class="bab-logo">🎯</span>
          <span class="bab-title">Auto Bet</span>
          <button class="bab-toggle" id="babToggle">−</button>
        </div>
        <div class="bab-content" id="babContent">
          <div class="bab-status" id="babStatus">
            <span class="bab-status-dot"></span>
            <span class="bab-status-text">Inicializando...</span>
          </div>
          <div class="bab-prediction" id="babPrediction">
            <span class="bab-pred-label">Próxima:</span>
            <span class="bab-pred-value">--</span>
          </div>
          <div class="bab-info">
            <div class="bab-info-item">
              <span>Gale:</span>
              <span id="babGale">0</span>
            </div>
            <div class="bab-info-item">
              <span>Aposta:</span>
              <span id="babBet">R$ 0</span>
            </div>
          </div>
        </div>
      </div>
    `;

    // Inject styles
    const styles = document.createElement('style');
    styles.textContent = `
      #blaze-autobet-overlay {
        position: fixed;
        top: 80px;
        right: 20px;
        z-index: 999999;
        font-family: 'Segoe UI', sans-serif;
      }
      .bab-container {
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        overflow: hidden;
        min-width: 200px;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      .bab-header {
        display: flex;
        align-items: center;
        padding: 10px 14px;
        background: rgba(0, 0, 0, 0.3);
        cursor: move;
      }
      .bab-logo { font-size: 18px; margin-right: 8px; }
      .bab-title {
        flex: 1;
        font-size: 14px;
        font-weight: 600;
        background: linear-gradient(90deg, #f39c12, #e74c3c);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .bab-toggle {
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        opacity: 0.7;
      }
      .bab-toggle:hover { opacity: 1; }
      .bab-content {
        padding: 12px 14px;
      }
      .bab-content.collapsed {
        display: none;
      }
      .bab-status {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        margin-bottom: 10px;
      }
      .bab-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #f39c12;
        animation: pulse 2s infinite;
      }
      .bab-status.success .bab-status-dot { background: #2ecc71; }
      .bab-status.error .bab-status-dot { background: #e74c3c; }
      .bab-status.betting .bab-status-dot { background: #3498db; }
      .bab-status-text { font-size: 12px; color: #fff; }
      .bab-prediction {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        margin-bottom: 10px;
      }
      .bab-pred-label { font-size: 12px; color: #aaa; }
      .bab-pred-value {
        font-size: 16px;
        font-weight: 700;
        color: #fff;
      }
      .bab-prediction.red { border-left: 3px solid #e74c3c; }
      .bab-prediction.black { border-left: 3px solid #34495e; }
      .bab-prediction.white { border-left: 3px solid #ecf0f1; }
      .bab-info {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .bab-info-item {
        background: rgba(255, 255, 255, 0.05);
        padding: 8px;
        border-radius: 6px;
        font-size: 11px;
        color: #aaa;
        display: flex;
        justify-content: space-between;
      }
      .bab-info-item span:last-child {
        color: #fff;
        font-weight: 600;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
    `;

    document.head.appendChild(styles);
    document.body.appendChild(overlay);

    // Setup toggle
    document.getElementById('babToggle').addEventListener('click', () => {
      const content = document.getElementById('babContent');
      const toggle = document.getElementById('babToggle');
      content.classList.toggle('collapsed');
      toggle.textContent = content.classList.contains('collapsed') ? '+' : '−';
    });

    // Make draggable
    makeDraggable(overlay);
  }

  function updateOverlayStatus(text, status = 'waiting') {
    const statusEl = document.getElementById('babStatus');
    const textEl = statusEl?.querySelector('.bab-status-text');
    
    if (statusEl && textEl) {
      statusEl.className = `bab-status ${status}`;
      textEl.textContent = text;
    }
  }

  function updateOverlayPrediction(prediction) {
    const predEl = document.getElementById('babPrediction');
    const valueEl = predEl?.querySelector('.bab-pred-value');
    
    if (predEl && valueEl) {
      predEl.className = `bab-prediction ${prediction.color}`;
      valueEl.textContent = `${prediction.color.toUpperCase()} (${prediction.confidence}%)`;
    }

    // Update bet info
    const galeEl = document.getElementById('babGale');
    const betEl = document.getElementById('babBet');
    
    if (galeEl) galeEl.textContent = prediction.galeLevel || 0;
    if (betEl) betEl.textContent = `R$ ${prediction.amount || state.config?.baseBet || 0}`;
  }

  function makeDraggable(element) {
    const header = element.querySelector('.bab-header');
    let isDragging = false;
    let offsetX, offsetY;

    header.addEventListener('mousedown', (e) => {
      isDragging = true;
      offsetX = e.clientX - element.offsetLeft;
      offsetY = e.clientY - element.offsetTop;
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      element.style.left = (e.clientX - offsetX) + 'px';
      element.style.top = (e.clientY - offsetY) + 'px';
      element.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  // ==================== MONITORING ====================

  function startMonitoring() {
    // Poll for game state every second
    setInterval(() => {
      checkGameState();
    }, 1000);

    // Periodically refresh JWT token
    setInterval(() => {
      extractJWTToken();
    }, 60000);

    // Send heartbeat to background
    setInterval(() => {
      sendToBackground({
        type: 'HEARTBEAT',
        status: {
          isDoubleGame: state.isDoubleGame,
          gameStatus: state.gameStatus,
          hasToken: !!state.jwtToken
        }
      });
    }, 5000);
  }

  // ==================== UTILITIES ====================

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==================== START ====================

  // Wait for page to fully load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
