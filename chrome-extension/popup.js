// Blaze Auto Bet - Popup Script

const DEBUG = true;
const log = (...args) => DEBUG && console.log('🤖 [Popup]', ...args);

document.addEventListener('DOMContentLoaded', async () => {
  log('Popup carregado');
  
  const extStatus = document.getElementById('ext-status');
  const blazeStatus = document.getElementById('blaze-status');
  const autoStatus = document.getElementById('auto-status');
  const betAmountInput = document.getElementById('bet-amount');
  const maxGalesInput = document.getElementById('max-gales');
  const saveConfigBtn = document.getElementById('save-config');
  const openBlazeBtn = document.getElementById('open-blaze');

  // Carregar configurações salvas
  chrome.storage.local.get(['betConfig', 'isEnabled', 'pendingSignal'], (result) => {
    log('Config carregada:', result);
    
    if (result.betConfig) {
      betAmountInput.value = result.betConfig.amount || 2.5;
      maxGalesInput.value = result.betConfig.maxGales || 2;
    }
    
    autoStatus.textContent = result.isEnabled ? 'Ligada' : 'Desligada';
    autoStatus.className = result.isEnabled ? 'status-value connected' : 'status-value disconnected';
    
    // Mostrar sinal pendente se houver
    if (result.pendingSignal) {
      log('Sinal pendente:', result.pendingSignal);
    }
  });

  // Verificar status da extensão
  extStatus.textContent = 'Ativa';
  extStatus.className = 'status-value connected';
  log('Extensão ativa');

  // Verificar se há uma tab do Blaze aberta
  const tabs = await chrome.tabs.query({
    url: ['*://blaze.bet.br/*', '*://blaze.com/*', '*://blaze1.space/*', '*://*.blaze.bet.br/*']
  });
  log(`Tabs do Blaze encontradas: ${tabs.length}`);

  if (tabs.length > 0) {
    blazeStatus.textContent = 'Conectado';
    blazeStatus.className = 'status-value connected';
    
    // Tentar obter status do content script
    try {
      log('Obtendo status do content script...');
      const response = await chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_STATUS' });
      log('Resposta do content script:', response);
      
      if (response) {
        autoStatus.textContent = response.isEnabled ? 'Ligada' : 'Desligada';
        autoStatus.className = response.isEnabled ? 'status-value connected' : 'status-value disconnected';
        
        // Adicionar info extra
        const statusDiv = document.querySelector('.status-section');
        if (statusDiv && response.currentColor) {
          const extraInfo = document.createElement('div');
          extraInfo.className = 'status-item';
          extraInfo.innerHTML = `
            <span class="status-label">Próxima aposta:</span>
            <span class="status-value" style="color: ${response.currentColor === 'red' ? '#ff4444' : '#333'}">
              ${response.currentColor === 'red' ? 'VERMELHO' : 'PRETO'}
            </span>
          `;
          statusDiv.appendChild(extraInfo);
        }
      }
    } catch (err) {
      log('Content script não respondeu:', err.message);
      blazeStatus.textContent = 'Tab aberta (aguardando)';
      blazeStatus.className = 'status-value';
    }
  } else {
    blazeStatus.textContent = 'Não conectado';
    blazeStatus.className = 'status-value disconnected';
  }

  // Salvar configurações
  saveConfigBtn.addEventListener('click', () => {
    const config = {
      amount: parseFloat(betAmountInput.value) || 2.5,
      maxGales: parseInt(maxGalesInput.value) || 2
    };

    log('Salvando config:', config);

    chrome.storage.local.set({ betConfig: config }, () => {
      saveConfigBtn.textContent = '✅ Salvo!';
      saveConfigBtn.classList.add('btn-success');
      
      // Notificar tabs do Blaze sobre a mudança
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: 'CONFIG_UPDATE', data: config }).catch(() => {});
      });
      
      setTimeout(() => {
        saveConfigBtn.textContent = '💾 Salvar Configurações';
        saveConfigBtn.classList.remove('btn-success');
      }, 2000);
    });
  });

  // Abrir Blaze
  openBlazeBtn.addEventListener('click', () => {
    log('Abrindo Blaze...');
    chrome.tabs.create({ url: 'https://blaze.bet.br/games/double' });
  });
  
  // Botão de debug
  const debugSection = document.createElement('div');
  debugSection.className = 'debug-section';
  debugSection.innerHTML = `
    <button id="test-signal" class="btn" style="background: #333; color: #0f0; border: 1px solid #0f0; margin-top: 10px; font-size: 11px;">
      🧪 Enviar Sinal de Teste
    </button>
    <button id="clear-signals" class="btn" style="background: #333; color: #f00; border: 1px solid #f00; margin-top: 10px; margin-left: 5px; font-size: 11px;">
      🗑️ Limpar
    </button>
  `;
  document.body.appendChild(debugSection);
  
  document.getElementById('test-signal').addEventListener('click', async () => {
    log('Enviando sinal de teste...');
    
    const testSignal = {
      color: Math.random() > 0.5 ? 'red' : 'black',
      amount: parseFloat(betAmountInput.value) || 2.5,
      confidence: 85,
      timestamp: Date.now()
    };
    
    // Salvar no storage
    await chrome.storage.local.set({
      pendingSignal: {
        ...testSignal,
        shouldBet: true
      }
    });
    
    // Enviar para tabs
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'BET_SIGNAL', data: testSignal });
        log('Sinal enviado para tab:', tab.id);
      } catch (err) {
        log('Erro ao enviar para tab:', err.message);
      }
    }
    
    alert(`Sinal de teste enviado: ${testSignal.color === 'red' ? 'VERMELHO' : 'PRETO'}`);
  });
  
  document.getElementById('clear-signals').addEventListener('click', async () => {
    await chrome.storage.local.remove('pendingSignal');
    log('Sinais limpos');
    alert('Sinais pendentes limpos!');
  });
});
