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
  let timerUpdateInterval = null;

  // Configurações
  const CONFIG = {
    minBetInterval: 5000, // 5 segundos entre apostas
    checkInterval: 1000, // Verificar estado a cada 1 segundo
    timerUpdateInterval: 100, // Atualizar timer a cada 100ms
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
      <div class="bap-timer-display" id="bap-timer-display">
        <div class="bap-timer-label">⏱️ Timer Blaze</div>
        <div class="bap-timer-value" id="bap-timer-value">--</div>
        <div class="bap-timer-phase" id="bap-timer-phase">Detectando...</div>
        <div class="bap-timer-bar">
          <div class="bap-timer-progress" id="bap-timer-progress"></div>
        </div>
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
    
    // Iniciar atualização do timer
    startTimerUpdate();
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

  // ============= TIMER DETECTION =============
  
  function startTimerUpdate() {
    log('Iniciando monitoramento do timer...');
    
    // Limpar intervalo anterior se existir
    if (timerUpdateInterval) {
      clearInterval(timerUpdateInterval);
    }
    
    // Atualizar timer a cada 100ms para precisão
    timerUpdateInterval = setInterval(updateTimerDisplay, CONFIG.timerUpdateInterval);
    
    // Primeira atualização imediata
    updateTimerDisplay();
  }
  
  function stopTimerUpdate() {
    if (timerUpdateInterval) {
      clearInterval(timerUpdateInterval);
      timerUpdateInterval = null;
    }
  }
  
  function updateTimerDisplay() {
    const timerData = detectBlazeTimer();
    
    const timerValueEl = document.getElementById('bap-timer-value');
    const timerPhaseEl = document.getElementById('bap-timer-phase');
    const timerProgressEl = document.getElementById('bap-timer-progress');
    const timerDisplayEl = document.getElementById('bap-timer-display');
    
    if (!timerValueEl || !timerPhaseEl || !timerProgressEl || !timerDisplayEl) return;
    
    if (timerData.detected) {
      // Atualizar valor do timer
      timerValueEl.textContent = timerData.formattedTime;
      timerValueEl.className = 'bap-timer-value ' + timerData.phaseClass;
      
      // Atualizar fase
      timerPhaseEl.textContent = timerData.phaseText;
      timerPhaseEl.className = 'bap-timer-phase ' + timerData.phaseClass;
      
      // Atualizar barra de progresso
      timerProgressEl.style.width = timerData.progressPercent + '%';
      timerProgressEl.className = 'bap-timer-progress ' + timerData.phaseClass;
      
      // Classe geral do display
      timerDisplayEl.className = 'bap-timer-display ' + timerData.phaseClass;
      
      // Broadcast timer data to app (throttled - every 500ms)
      if (!updateTimerDisplay.lastBroadcast || Date.now() - updateTimerDisplay.lastBroadcast > 500) {
        broadcastTimerData(timerData);
        updateTimerDisplay.lastBroadcast = Date.now();
      }
    } else {
      timerValueEl.textContent = '--';
      timerValueEl.className = 'bap-timer-value';
      timerPhaseEl.textContent = 'Timer não detectado';
      timerPhaseEl.className = 'bap-timer-phase';
      timerProgressEl.style.width = '0%';
      timerDisplayEl.className = 'bap-timer-display';
    }
  }
  
  function detectBlazeTimer() {
    const result = {
      detected: false,
      seconds: null,
      formattedTime: '--',
      phase: 'unknown',
      phaseText: 'Desconhecido',
      phaseClass: '',
      progressPercent: 0,
      maxTime: 30 // Tempo máximo típico de apostas
    };
    
    // Seletores específicos para timer do Blaze Double
    const timerSelectors = [
      // Seletores de timer específicos Blaze
      '.time-left',
      '.timer-value',
      '.countdown',
      '.countdown-timer',
      '[class*="timer"]',
      '[class*="countdown"]',
      '[class*="time-left"]',
      '.roulette-timer',
      '.double-timer',
      '.game-timer',
      
      // Elementos com tempo numérico
      '[class*="seconds"]',
      '[class*="clock"]',
    ];
    
    for (const selector of timerSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (el.offsetParent === null) continue; // Não visível
        
        const text = el.textContent?.trim() || '';
        const timeMatch = parseTimeFromText(text);
        
        if (timeMatch !== null) {
          result.detected = true;
          result.seconds = timeMatch;
          result.formattedTime = formatTime(timeMatch);
          
          // Determinar fase baseado no tempo
          if (timeMatch > 0) {
            result.phase = 'betting';
            result.phaseText = '🟢 APOSTAS ABERTAS';
            result.phaseClass = 'phase-betting';
            result.progressPercent = Math.min(100, (timeMatch / result.maxTime) * 100);
          } else {
            result.phase = 'rolling';
            result.phaseText = '🔴 GIRANDO';
            result.phaseClass = 'phase-rolling';
            result.progressPercent = 0;
          }
          
          // Alerta quando tempo baixo
          if (timeMatch > 0 && timeMatch <= 5) {
            result.phaseText = '⚡ ÚLTIMOS SEGUNDOS!';
            result.phaseClass = 'phase-urgent';
          }
          
          return result;
        }
      }
    }
    
    // Detectar fase pelo estado visual se timer não encontrado
    const rollingIndicators = document.querySelectorAll('[class*="rolling"], [class*="spinning"], [class*="girando"]');
    for (const el of rollingIndicators) {
      if (el.offsetParent !== null) {
        result.detected = true;
        result.phase = 'rolling';
        result.phaseText = '🔴 GIRANDO';
        result.phaseClass = 'phase-rolling';
        result.formattedTime = '⏳';
        return result;
      }
    }
    
    const waitingIndicators = document.querySelectorAll('[class*="waiting"], [class*="aguardando"], [class*="bet-open"]');
    for (const el of waitingIndicators) {
      if (el.offsetParent !== null) {
        result.detected = true;
        result.phase = 'betting';
        result.phaseText = '🟢 APOSTAS ABERTAS';
        result.phaseClass = 'phase-betting';
        result.formattedTime = '✓';
        return result;
      }
    }
    
    // Tentar detectar por MutationObserver no próximo ciclo
    return result;
  }
  
  function parseTimeFromText(text) {
    if (!text) return null;
    
    // Limpar texto
    text = text.trim().toLowerCase();
    
    // Padrões de tempo
    // "15.5", "15,5", "15.50s", "15s"
    const patterns = [
      /^(\d+)[.,](\d+)\s*s?$/,           // 15.5 ou 15,5 ou 15.5s
      /^(\d+)\s*s$/,                       // 15s
      /^(\d+)$/,                           // 15
      /^(\d+):(\d+)$/,                     // 0:15
      /(\d+)[.,]?(\d*)\s*(?:segundo|second|seg|s)/i, // "15 segundos"
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        if (match[2] !== undefined && pattern.source.includes(':')) {
          // Formato MM:SS
          return parseInt(match[1]) * 60 + parseInt(match[2]);
        } else if (match[2] !== undefined && match[2] !== '') {
          // Formato decimal
          return parseFloat(match[1] + '.' + match[2]);
        } else {
          return parseFloat(match[1]);
        }
      }
    }
    
    // Último recurso: tentar extrair qualquer número
    const numMatch = text.match(/(\d+[.,]?\d*)/);
    if (numMatch) {
      const num = parseFloat(numMatch[1].replace(',', '.'));
      // Só considerar se parecer ser segundos (0-60)
      if (num >= 0 && num <= 60) {
        return num;
      }
    }
    
    return null;
  }
  
  function formatTime(seconds) {
    if (seconds === null) return '--';
    
    if (seconds >= 60) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    // Mostrar com decimal se for menor que 10
    if (seconds < 10) {
      return seconds.toFixed(1) + 's';
    }
    
    return Math.floor(seconds) + 's';
  }

  // ============= MUTATION OBSERVER =============
  
  let blazeObserver = null;
  let lastDetectedPhase = null;
  let lastDetectedResult = null;
  let observerDebounceTimer = null;
  
  function startBlazeObserver() {
    log('🔭 Iniciando MutationObserver...');
    
    // Parar observer anterior se existir
    stopBlazeObserver();
    
    // Encontrar container principal do jogo
    const gameContainer = findGameContainer();
    
    if (!gameContainer) {
      warn('Container do jogo não encontrado, observando body...');
    }
    
    const targetNode = gameContainer || document.body;
    
    // Configuração do observer
    const observerConfig = {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-status', 'disabled']
    };
    
    // Criar observer
    blazeObserver = new MutationObserver((mutations) => {
      if (observerDebounceTimer) clearTimeout(observerDebounceTimer);
      observerDebounceTimer = setTimeout(() => processMutations(mutations), 50);
    });
    
    blazeObserver.observe(targetNode, observerConfig);
    log('✅ MutationObserver ativo em:', targetNode.className || targetNode.tagName);
    addLog('🔭 Observer DOM ativo');
  }
  
  function stopBlazeObserver() {
    if (blazeObserver) {
      blazeObserver.disconnect();
      blazeObserver = null;
    }
    if (observerDebounceTimer) {
      clearTimeout(observerDebounceTimer);
      observerDebounceTimer = null;
    }
  }
  
  function findGameContainer() {
    const selectors = [
      '.double-container', '.game-double', '[class*="double-game"]',
      '.roulette-container', '[class*="roulette"]', '.game-container',
      '[class*="game-content"]', 'main', '#game', '#double'
    ];
    
    for (const selector of selectors) {
      const container = document.querySelector(selector);
      if (container) return container;
    }
    return null;
  }
  
  function processMutations(mutations) {
    let hasRelevantChanges = false;
    
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const classes = mutation.target.className?.toLowerCase() || '';
        
        if (classes.includes('rolling') || classes.includes('spinning') || classes.includes('girando')) {
          if (lastDetectedPhase !== 'rolling') {
            lastDetectedPhase = 'rolling';
            onPhaseChange('rolling');
          }
        } else if (classes.includes('waiting') || classes.includes('betting') || classes.includes('open')) {
          if (lastDetectedPhase !== 'betting') {
            lastDetectedPhase = 'betting';
            onPhaseChange('betting');
          }
        } else if (classes.includes('complete') || classes.includes('result') || classes.includes('finished')) {
          if (lastDetectedPhase !== 'complete') {
            lastDetectedPhase = 'complete';
            onPhaseChange('complete');
          }
        }
        hasRelevantChanges = true;
      }
      
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          
          const classes = node.className?.toLowerCase() || '';
          
          if (classes.includes('result') || classes.includes('winner') || 
              classes.includes('last-') || classes.includes('history')) {
            const result = detectResultFromElement(node);
            if (result && JSON.stringify(result) !== JSON.stringify(lastDetectedResult)) {
              lastDetectedResult = result;
              onNewResult(result);
            }
          }
          
          if (classes.includes('red') || classes.includes('black') || classes.includes('white')) {
            const result = detectResultFromElement(node);
            if (result) onNewResult(result);
          }
        }
        hasRelevantChanges = true;
      }
    }
    
    if (hasRelevantChanges) updateTimerDisplay();
  }
  
  function onPhaseChange(phase) {
    log(`🔄 Fase: ${phase}`);
    
    switch (phase) {
      case 'betting':
        addLog('🟢 Apostas abertas!');
        if (isWaitingToBet && currentColor) {
          placeBet(currentColor, currentBetAmount);
        }
        break;
      case 'rolling':
        addLog('🎰 Girando...');
        break;
      case 'complete':
        addLog('✅ Resultado!');
        break;
    }
  }
  
  function onNewResult(result) {
    log(`🎯 Resultado:`, result);
    addLog(`🎯 ${result.color?.toUpperCase() || '?'} ${result.number !== null ? `(${result.number})` : ''}`);
    
    // Notificar background script
    try {
      chrome.runtime.sendMessage({ type: 'NEW_RESULT', data: result });
    } catch (e) {}
    
    // Salvar no localStorage para o app
    try {
      const key = 'blaze-latest-results';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.unshift({ ...result, timestamp: Date.now() });
      localStorage.setItem(key, JSON.stringify(existing.slice(0, 20)));
    } catch (e) {}
    
    // Enviar via postMessage para o app
    window.postMessage({ type: 'NEW_RESULT', data: result }, '*');
    
    // Enviar via BroadcastChannel
    try {
      const channel = new BroadcastChannel('blaze-auto-bet');
      channel.postMessage({ type: 'NEW_RESULT', data: result });
      setTimeout(() => channel.close(), 100);
    } catch (e) {}
  }
  
  // Broadcast extension status to app
  function broadcastExtensionStatus() {
    const status = {
      isEnabled,
      connectionStatus,
      currentColor,
      currentBetAmount,
      isBettingOpen: isBettingOpen(),
      timestamp: Date.now()
    };
    
    // Save to localStorage
    try {
      localStorage.setItem('blaze-extension-status', JSON.stringify(status));
    } catch (e) {}
    
    // Send via postMessage
    window.postMessage({ type: 'EXTENSION_STATUS', data: status }, '*');
    
    // Send via BroadcastChannel
    try {
      const channel = new BroadcastChannel('blaze-auto-bet');
      channel.postMessage({ type: 'EXTENSION_STATUS', data: status });
      setTimeout(() => channel.close(), 100);
    } catch (e) {}
    
    log('📤 Status broadcast:', status);
  }
  
  // Broadcast timer data to app
  function broadcastTimerData(timerData) {
    const data = {
      phase: timerData.phase,
      timeLeft: timerData.seconds,
      phaseText: timerData.phaseText,
      timestamp: Date.now()
    };
    
    window.postMessage({ type: 'TIMER_UPDATE', data }, '*');
  }
  
  function detectResultFromElement(element) {
    if (!element) return null;
    
    const result = { color: null, number: null, timestamp: Date.now() };
    const classes = element.className?.toLowerCase() || '';
    const text = element.textContent?.trim() || '';
    const bgColor = window.getComputedStyle(element).backgroundColor;
    
    if (classes.includes('red') || classes.includes('vermelho')) result.color = 'red';
    else if (classes.includes('black') || classes.includes('preto')) result.color = 'black';
    else if (classes.includes('white') || classes.includes('branco')) result.color = 'white';
    
    if (!result.color) {
      const normalized = normalizeColor(bgColor);
      if (['red', 'black', 'white'].includes(normalized)) result.color = normalized;
    }
    
    const numMatch = text.match(/\b(\d{1,2})\b/);
    if (numMatch) {
      const num = parseInt(numMatch[1]);
      if (num >= 0 && num <= 14) {
        result.number = num;
        if (!result.color) {
          result.color = num === 0 ? 'white' : num <= 7 ? 'red' : 'black';
        }
      }
    }
    
    return result.color ? result : null;
  }

  function debugUI() {
    log('🔍 ========== DEBUG UI BLAZE ==========');
    addLog('🔍 Iniciando debug completo...');
    
    // Detectar qual jogo está ativo
    const gameType = detectGameType();
    log('Tipo de jogo detectado:', gameType);
    addLog(`Jogo: ${gameType}`);
    
    // Verificar input de aposta
    const betInput = getBetInput();
    log('Input de aposta:', betInput ? '✅ Encontrado' : '❌ Não encontrado');
    if (betInput) {
      log('  - Tag:', betInput.tagName);
      log('  - Class:', betInput.className);
      log('  - Type:', betInput.type);
      log('  - Value:', betInput.value);
      log('  - Placeholder:', betInput.placeholder);
      log('  - Parent:', betInput.parentElement?.className);
    }
    addLog(`Input valor: ${betInput ? '✅' : '❌'}`);
    
    // Verificar botões de cor
    const redBtn = getColorButton('red');
    const blackBtn = getColorButton('black');
    const whiteBtn = getColorButton('white');
    log('Botão vermelho:', redBtn ? '✅ Encontrado' : '❌ Não encontrado');
    if (redBtn) log('  - Class:', redBtn.className, '- Text:', redBtn.textContent?.substring(0, 20));
    log('Botão preto:', blackBtn ? '✅ Encontrado' : '❌ Não encontrado');
    if (blackBtn) log('  - Class:', blackBtn.className, '- Text:', blackBtn.textContent?.substring(0, 20));
    log('Botão branco:', whiteBtn ? '✅ Encontrado' : '❌ Não encontrado');
    addLog(`🔴${redBtn ? '✅' : '❌'} ⚫${blackBtn ? '✅' : '❌'} ⚪${whiteBtn ? '✅' : '❌'}`);
    
    // Verificar botão de confirmação
    const confirmBtn = getConfirmButton();
    log('Botão confirmar:', confirmBtn ? '✅ Encontrado' : '❌ Não encontrado');
    if (confirmBtn) log('  - Class:', confirmBtn.className, '- Text:', confirmBtn.textContent?.substring(0, 20));
    addLog(`Btn confirmar: ${confirmBtn ? '✅' : '❌'}`);
    
    // Verificar status de apostas
    const bettingStatus = getBettingStatus();
    log('Status apostas:', bettingStatus);
    addLog(`Status: ${bettingStatus.open ? '✅ ABERTO' : '❌ FECHADO'} - ${bettingStatus.phase}`);
    
    // Detectar elementos específicos do Double
    log('\n--- Estrutura Double ---');
    const doubleContainer = document.querySelector('.double-container, [class*="double"], .roulette-container, [class*="roulette"]');
    log('Container Double:', doubleContainer ? '✅' : '❌', doubleContainer?.className);
    
    // Buscar área de apostas
    const betArea = document.querySelector('.bet-area, .betting-area, [class*="bet-area"], [class*="betting"]');
    log('Área de apostas:', betArea ? '✅' : '❌', betArea?.className);
    
    // Listar elementos clicáveis com cores
    log('\n--- Elementos com cores ---');
    const colorElements = document.querySelectorAll('[class*="red"], [class*="black"], [class*="white"], [class*="vermelho"], [class*="preto"], [class*="branco"]');
    colorElements.forEach((el, i) => {
      if (el.offsetParent !== null) {
        log(`  Cor ${i}:`, el.tagName, el.className.substring(0, 50), '- Clicável:', isClickable(el));
      }
    });
    
    // Listar botões visíveis
    log('\n--- Botões visíveis ---');
    const allButtons = document.querySelectorAll('button, [role="button"], .btn, [class*="button"]');
    let visibleBtnCount = 0;
    allButtons.forEach((btn, i) => {
      if (btn.offsetParent !== null && visibleBtnCount < 15) {
        visibleBtnCount++;
        const text = btn.textContent?.trim().substring(0, 25) || '';
        const cls = btn.className?.substring(0, 40) || '';
        log(`  Btn ${i}: [${btn.tagName}] "${text}" class="${cls}"`);
      }
    });
    
    // Listar inputs visíveis
    log('\n--- Inputs visíveis ---');
    const allInputs = document.querySelectorAll('input, [contenteditable="true"]');
    allInputs.forEach((input, i) => {
      if (input.offsetParent !== null) {
        log(`  Input ${i}: type=${input.type} class="${input.className}" placeholder="${input.placeholder}" value="${input.value}"`);
      }
    });
    
    // Verificar timer/contador
    log('\n--- Timer/Contador ---');
    const timerElements = document.querySelectorAll('[class*="timer"], [class*="countdown"], [class*="time"], [class*="clock"]');
    timerElements.forEach((el, i) => {
      if (el.offsetParent !== null) {
        log(`  Timer ${i}:`, el.className, '- Texto:', el.textContent?.trim().substring(0, 20));
      }
    });
    
    log('🔍 ========== FIM DEBUG ==========');
    addLog('🔍 Debug completo - veja console');
  }

  function detectGameType() {
    const url = window.location.href.toLowerCase();
    if (url.includes('double')) return 'double';
    if (url.includes('crash')) return 'crash';
    if (url.includes('dice')) return 'dice';
    
    // Detectar por elementos na página
    if (document.querySelector('[class*="double"]')) return 'double';
    if (document.querySelector('[class*="crash"]')) return 'crash';
    
    return 'unknown';
  }

  function isClickable(el) {
    return el.tagName === 'BUTTON' || 
           el.tagName === 'A' || 
           el.getAttribute('role') === 'button' ||
           el.onclick !== null ||
           el.style.cursor === 'pointer' ||
           window.getComputedStyle(el).cursor === 'pointer';
  }

  function getBettingStatus() {
    const result = { open: false, phase: 'unknown', timeLeft: null };
    
    // Verificar fases do jogo
    const phases = {
      waiting: ['aguardando', 'waiting', 'faça sua aposta', 'place your bet', 'apostas abertas', 'bet now'],
      rolling: ['girando', 'rolling', 'em andamento', 'spinning'],
      complete: ['complete', 'resultado', 'result']
    };
    
    const pageText = (document.body.innerText || '').toLowerCase();
    
    for (const [phase, keywords] of Object.entries(phases)) {
      if (keywords.some(k => pageText.includes(k))) {
        result.phase = phase;
        result.open = phase === 'waiting';
        break;
      }
    }
    
    // Verificar timer
    const timerEl = document.querySelector('[class*="timer"], [class*="countdown"]');
    if (timerEl) {
      const timeText = timerEl.textContent?.trim();
      if (timeText) {
        result.timeLeft = timeText;
        // Se tem timer visível, provavelmente apostas estão abertas
        const seconds = parseFloat(timeText);
        if (!isNaN(seconds) && seconds > 0) {
          result.open = true;
          result.phase = 'waiting';
        }
      }
    }
    
    // Verificar se botões de cor estão habilitados
    const colorBtn = document.querySelector('[class*="red"], [class*="black"]');
    if (colorBtn && !colorBtn.classList.contains('disabled') && !colorBtn.hasAttribute('disabled')) {
      result.open = true;
    }
    
    return result;
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
    
    // Broadcast status change to app
    broadcastExtensionStatus();
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
    
    // Seletores específicos do Blaze Double (ordem de prioridade)
    const selectors = [
      // Seletores específicos Blaze
      'input.input-field', // Input comum Blaze
      '.bet-input input',
      '.input-value input',
      'input[class*="input"]',
      
      // Seletores por área de apostas
      '.betting-area input',
      '.bet-area input',
      '.double-bet input',
      '[class*="betting"] input',
      '[class*="bet-form"] input',
      
      // Seletores genéricos
      'input[type="number"]',
      'input[type="text"][inputmode="decimal"]',
      'input[type="text"][inputmode="numeric"]',
      'input[placeholder*="0"]',
      'input[placeholder*="R$"]',
      'input[placeholder*="valor"]',
      'input[placeholder*="Valor"]',
    ];
    
    for (const selector of selectors) {
      const inputs = document.querySelectorAll(selector);
      for (const input of inputs) {
        // Verificar se está visível e parece ser input de aposta
        if (input && input.offsetParent !== null) {
          // Evitar inputs de busca, login, etc
          const isSearchOrAuth = input.closest('[class*="search"], [class*="login"], [class*="auth"], header, nav');
          if (!isSearchOrAuth) {
            log(`  ✅ Input encontrado: ${selector} - class="${input.className}"`);
            return input;
          }
        }
      }
    }
    
    // Busca mais agressiva - qualquer input numérico na área do jogo
    const gameArea = document.querySelector('[class*="double"], [class*="game"], [class*="roulette"], main, .main-content');
    if (gameArea) {
      const inputs = gameArea.querySelectorAll('input');
      for (const input of inputs) {
        if (input.offsetParent !== null && 
            (input.type === 'number' || input.type === 'text' || input.type === '')) {
          log('  ✅ Input encontrado na área do jogo');
          return input;
        }
      }
    }
    
    warn('  ❌ Nenhum input de aposta encontrado');
    return null;
  }

  function getColorButton(color) {
    log(`Procurando botão ${color}...`);
    
    // Mapeamento de cores
    const colorMap = {
      red: { 
        classes: ['red', 'vermelho', 'color-red', 'btn-red'],
        bgColors: ['#f12c4c', '#ff0000', '#e91e63', '#f44336', 'rgb(241, 44, 76)'],
        multiplier: '2x'
      },
      black: { 
        classes: ['black', 'preto', 'color-black', 'btn-black'],
        bgColors: ['#1e1e1e', '#000000', '#333333', '#212121', 'rgb(30, 30, 30)'],
        multiplier: '2x'
      },
      white: { 
        classes: ['white', 'branco', 'color-white', 'btn-white'],
        bgColors: ['#ffffff', '#fafafa', 'rgb(255, 255, 255)'],
        multiplier: '14x'
      }
    };
    
    const colorInfo = colorMap[color] || colorMap.red;
    
    // 1. Seletores específicos por classe
    const classSelectors = colorInfo.classes.flatMap(c => [
      `button[class*="${c}"]`,
      `div[class*="${c}"][class*="bet"]`,
      `div[class*="${c}"][class*="button"]`,
      `[class*="${c}"][role="button"]`,
      `.${c}`,
      `[class*="color-${c}"]`,
      `[class*="bet-${c}"]`,
    ]);
    
    for (const selector of classSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (el.offsetParent !== null && isClickable(el)) {
          log(`  ✅ Botão ${color} encontrado: ${selector}`);
          return el;
        }
      }
    }
    
    // 2. Busca por cor de fundo
    const allClickables = document.querySelectorAll('button, [role="button"], div[class*="bet"], div[class*="color"], div[class*="button"]');
    for (const el of allClickables) {
      if (el.offsetParent === null) continue;
      
      const style = window.getComputedStyle(el);
      const bgColor = style.backgroundColor.toLowerCase();
      
      for (const targetColor of colorInfo.bgColors) {
        if (bgColor.includes(targetColor.toLowerCase()) || 
            normalizeColor(bgColor) === normalizeColor(targetColor)) {
          log(`  ✅ Botão ${color} encontrado por cor de fundo: ${bgColor}`);
          return el;
        }
      }
    }
    
    // 3. Busca por data attributes
    const dataSelectors = [
      `[data-color="${color}"]`,
      `[data-bet-color="${color}"]`,
      `[data-value="${color}"]`,
    ];
    
    for (const selector of dataSelectors) {
      const el = document.querySelector(selector);
      if (el && el.offsetParent !== null) {
        log(`  ✅ Botão ${color} encontrado por data-attribute: ${selector}`);
        return el;
      }
    }
    
    // 4. Busca por texto/multiplicador
    const textTargets = color === 'red' ? ['vermelho', 'red', '2x'] : 
                        color === 'black' ? ['preto', 'black', '2x'] : 
                        ['branco', 'white', '14x'];
    
    const clickables = document.querySelectorAll('button, [role="button"], div[class*="bet"], [class*="color"]');
    for (const el of clickables) {
      if (el.offsetParent === null) continue;
      const text = (el.textContent || '').toLowerCase().trim();
      const classes = (el.className || '').toLowerCase();
      
      // Verificar se contém o texto da cor específica
      if (textTargets.some(t => text.includes(t) || classes.includes(t))) {
        // Para 2x, precisa verificar a cor também
        if (text === '2x') {
          const style = window.getComputedStyle(el);
          const bgColor = style.backgroundColor;
          const isRed = colorInfo.bgColors.some(c => normalizeColor(bgColor) === normalizeColor(c));
          if (color === 'red' && !isRed) continue;
          if (color === 'black' && isRed) continue;
        }
        log(`  ✅ Botão ${color} encontrado por texto: "${text}"`);
        return el;
      }
    }
    
    warn(`  ❌ Botão ${color} não encontrado`);
    return null;
  }

  function normalizeColor(color) {
    // Normaliza cores para comparação
    if (!color) return '';
    color = color.toLowerCase().trim();
    
    // Converter rgb para hex aproximado
    const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const [, r, g, b] = rgbMatch.map(Number);
      // Classificar cor
      if (r > 200 && g < 100 && b < 100) return 'red';
      if (r < 50 && g < 50 && b < 50) return 'black';
      if (r > 200 && g > 200 && b > 200) return 'white';
    }
    
    if (color.includes('#f12c4c') || color.includes('#f44336')) return 'red';
    if (color.includes('#1e1e1e') || color.includes('#000')) return 'black';
    if (color.includes('#fff')) return 'white';
    
    return color;
  }

  function getConfirmButton() {
    log('Procurando botão de confirmação...');
    
    // Seletores específicos para Blaze
    const selectors = [
      // Botões de confirmação específicos
      'button[class*="confirm"]',
      'button[class*="submit"]',
      'button[class*="apostar"]',
      'button[class*="bet-button"]',
      '.confirm-bet',
      '.bet-confirm',
      'button[type="submit"]',
      
      // Seletores por área
      '.betting-area button[class*="primary"]',
      '.bet-form button',
      '[class*="bet"] button[class*="btn"]',
    ];
    
    for (const selector of selectors) {
      const btn = document.querySelector(selector);
      if (btn && btn.offsetParent !== null && !btn.disabled) {
        log(`  ✅ Botão confirmar encontrado: ${selector}`);
        return btn;
      }
    }
    
    // Busca por texto em português e inglês
    const confirmTexts = ['apostar', 'confirmar', 'bet', 'place bet', 'fazer aposta', 'start bet'];
    const buttons = document.querySelectorAll('button, [role="button"]');
    for (const btn of buttons) {
      const text = (btn.textContent || '').toLowerCase().trim();
      if (confirmTexts.some(t => text.includes(t)) && btn.offsetParent !== null && !btn.disabled) {
        // Evitar botões de cor que podem ter texto similar
        if (!btn.className.toLowerCase().includes('red') && 
            !btn.className.toLowerCase().includes('black') &&
            !btn.className.toLowerCase().includes('white')) {
          log('  ✅ Botão confirmar encontrado via texto:', text);
          return btn;
        }
      }
    }
    
    log('  ℹ️ Botão confirmar não encontrado (fluxo pode ser direto pelo botão de cor)');
    return null;
  }

  function isBettingOpen() {
    const status = getBettingStatus();
    log('Status de apostas:', status);
    return status.open;
  }

  async function placeBet(color, amount) {
    const colorLabel = color === 'red' ? 'VERMELHO' : color === 'black' ? 'PRETO' : 'BRANCO';
    log(`🎲 Iniciando aposta: ${colorLabel} R$ ${amount}`);
    
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

    addLog(`🎯 Apostando R$ ${amount.toFixed(2)} no ${colorLabel}${color === 'white' ? ' (proteção)' : ''}...`);

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
      const successLabel = color === 'red' ? 'VERMELHO' : color === 'black' ? 'PRETO' : 'BRANCO';
      addLog(`✅ Aposta realizada: R$ ${amount.toFixed(2)} no ${successLabel}${color === 'white' ? ' (proteção)' : ''}`);
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
    
    // Iniciar MutationObserver para detectar mudanças no DOM
    startBlazeObserver();
    
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
    
    // Parar MutationObserver
    stopBlazeObserver();
    
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
    
    // Handle white protection signals
    if (event.data && event.data.type === 'WHITE_PROTECTION_SIGNAL') {
      log('📨 White Protection Signal recebido:', event.data);
      addLog('⚪ Proteção branco via postMessage');
      processSignal(event.data.data);
    }
    
    // Respond to status requests from the app
    if (event.data && event.data.type === 'GET_EXTENSION_STATUS') {
      log('📨 Status request recebido');
      broadcastExtensionStatus();
    }
  }

  function checkForLocalStorageSignals() {
    if (!isEnabled) return;
    
    try {
      // Check for regular bet signals
      const signalData = localStorage.getItem(CONFIG.localStorageKey);
      if (signalData) {
        log('📦 Verificando localStorage (bet):', signalData);
        processLocalStorageSignal(signalData, CONFIG.localStorageKey);
      }
      
      // Check for white protection signals
      const whiteProtectionData = localStorage.getItem('blaze-white-protection-signal');
      if (whiteProtectionData) {
        log('📦 Verificando localStorage (white protection):', whiteProtectionData);
        processLocalStorageSignal(whiteProtectionData, 'blaze-white-protection-signal');
      }
    } catch (err) {
      error('Erro ao ler localStorage:', err);
    }
  }

  function processLocalStorageSignal(signalData, storageKey = CONFIG.localStorageKey) {
    try {
      const signal = JSON.parse(signalData);
      log('📥 Processando sinal localStorage:', signal);
      
      // Evitar processar o mesmo sinal
      if (signal.timestamp && signal.timestamp <= lastProcessedSignalTime) {
        log('  ⏭️ Sinal já processado, ignorando');
        return;
      }
      
      lastProcessedSignalTime = signal.timestamp || Date.now();
      
      if (signal.isWhiteProtection) {
        addLog('⚪ Proteção branco detectada via localStorage');
      }
      
      processSignal(signal);
      
      // Limpar sinal após processar
      localStorage.removeItem(storageKey);
    } catch (err) {
      error('Erro ao processar sinal localStorage:', err);
    }
  }

  async function processSignal(signal) {
    if (!isEnabled) {
      log('⛔ Automação desativada, ignorando sinal');
      return;
    }
    
    // Accept red, black, or white (for protection)
    if (!signal.color || !['red', 'black', 'white'].includes(signal.color)) {
      warn('⚠️ Sinal inválido, cor não especificada:', signal);
      return;
    }
    
    log('🎯 Processando sinal:', signal);
    
    currentBetAmount = signal.amount || currentBetAmount;
    currentColor = signal.color;
    
    const colorLabel = signal.color === 'red' ? 'VERMELHO' : signal.color === 'black' ? 'PRETO' : 'BRANCO';
    const isProtection = signal.isWhiteProtection || signal.color === 'white';
    
    updateStatus('Conectado', colorLabel, currentBetAmount);
    addLog(`📡 ${isProtection ? '⚪ PROTEÇÃO: ' : 'Sinal: '}${colorLabel} R$${currentBetAmount} (${signal.confidence || '?'}%)`);
    
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
      if (event.data && event.data.type === 'WHITE_PROTECTION_SIGNAL') {
        addLog('⚪ Proteção branco via BroadcastChannel');
        processSignal(event.data.data);
      }
      if (event.data && event.data.type === 'GET_STATUS') {
        log('📡 Status request via BroadcastChannel');
        broadcastExtensionStatus();
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
