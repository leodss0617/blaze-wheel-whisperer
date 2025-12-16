// Blaze Auto Bet - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const extStatus = document.getElementById('ext-status');
  const blazeStatus = document.getElementById('blaze-status');
  const autoStatus = document.getElementById('auto-status');
  const betAmountInput = document.getElementById('bet-amount');
  const maxGalesInput = document.getElementById('max-gales');
  const saveConfigBtn = document.getElementById('save-config');
  const openBlazeBtn = document.getElementById('open-blaze');

  // Carregar configurações salvas
  chrome.storage.local.get(['betConfig', 'isEnabled'], (result) => {
    if (result.betConfig) {
      betAmountInput.value = result.betConfig.amount || 2.5;
      maxGalesInput.value = result.betConfig.maxGales || 2;
    }
    
    autoStatus.textContent = result.isEnabled ? 'Ligada' : 'Desligada';
    autoStatus.className = result.isEnabled ? 'status-value connected' : 'status-value disconnected';
  });

  // Verificar status da extensão
  extStatus.textContent = 'Ativa';
  extStatus.className = 'status-value connected';

  // Verificar se há uma tab do Blaze aberta
  const tabs = await chrome.tabs.query({
    url: ['*://blaze.bet.br/*', '*://blaze.com/*', '*://blaze1.space/*']
  });

  if (tabs.length > 0) {
    blazeStatus.textContent = 'Conectado';
    blazeStatus.className = 'status-value connected';
    
    // Tentar obter status do content script
    try {
      const response = await chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_STATUS' });
      if (response) {
        autoStatus.textContent = response.isEnabled ? 'Ligada' : 'Desligada';
        autoStatus.className = response.isEnabled ? 'status-value connected' : 'status-value disconnected';
      }
    } catch (error) {
      console.log('Content script não respondeu');
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

    chrome.storage.local.set({ betConfig: config }, () => {
      saveConfigBtn.textContent = '✅ Salvo!';
      saveConfigBtn.classList.add('btn-success');
      
      setTimeout(() => {
        saveConfigBtn.textContent = '💾 Salvar Configurações';
        saveConfigBtn.classList.remove('btn-success');
      }, 2000);
    });
  });

  // Abrir Blaze
  openBlazeBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://blaze.bet.br/games/double' });
  });
});
