// =====================================================
// BLAZE AUTO BET - POPUP CONTROLLER
// =====================================================

class PopupController {
  constructor() {
    this.config = {};
    this.stats = {};
    this.init();
  }

  async init() {
    await this.loadConfig();
    await this.loadStats();
    this.setupEventListeners();
    this.updateUI();
    this.startStatusPolling();
    this.addLog('Sistema iniciado', 'info');
  }

  // ==================== STORAGE ====================
  
  async loadConfig() {
    const result = await chrome.storage.local.get('blazeConfig');
    this.config = result.blazeConfig || {
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

  async saveConfig() {
    // Collect values from inputs
    this.config.autoBetEnabled = document.getElementById('autoBetEnabled').checked;
    this.config.galeEnabled = document.getElementById('galeEnabled').checked;
    this.config.currentBankroll = parseFloat(document.getElementById('currentBankroll').value) || 100;
    this.config.baseBet = parseFloat(document.getElementById('baseBet').value) || 2;
    this.config.maxGales = parseInt(document.getElementById('maxGales').value) || 2;
    this.config.galeMultiplier = parseFloat(document.getElementById('galeMultiplier').value) || 2;
    this.config.stopWin = parseFloat(document.getElementById('stopWin').value) || 50;
    this.config.stopLoss = parseFloat(document.getElementById('stopLoss').value) || 30;
    this.config.minConfidence = parseInt(document.getElementById('minConfidence').value) || 70;
    this.config.serverUrl = document.getElementById('serverUrl').value || '';

    await chrome.storage.local.set({ blazeConfig: this.config });
    
    // Notify content script and background
    chrome.runtime.sendMessage({ 
      type: 'CONFIG_UPDATED', 
      config: this.config 
    });

    this.addLog('Configuração salva', 'success');
  }

  async loadStats() {
    const result = await chrome.storage.local.get('blazeStats');
    const today = new Date().toDateString();
    
    this.stats = result.blazeStats || {
      date: today,
      totalProfit: 0,
      totalBets: 0,
      wins: 0,
      losses: 0,
      currentGale: 0
    };

    // Reset if new day
    if (this.stats.date !== today) {
      this.stats = {
        date: today,
        totalProfit: 0,
        totalBets: 0,
        wins: 0,
        losses: 0,
        currentGale: 0
      };
      await this.saveStats();
    }
  }

  async saveStats() {
    await chrome.storage.local.set({ blazeStats: this.stats });
  }

  // ==================== UI ====================

  updateUI() {
    // Config inputs
    document.getElementById('autoBetEnabled').checked = this.config.autoBetEnabled;
    document.getElementById('galeEnabled').checked = this.config.galeEnabled;
    document.getElementById('currentBankroll').value = this.config.currentBankroll;
    document.getElementById('baseBet').value = this.config.baseBet;
    document.getElementById('maxGales').value = this.config.maxGales;
    document.getElementById('galeMultiplier').value = this.config.galeMultiplier;
    document.getElementById('stopWin').value = this.config.stopWin;
    document.getElementById('stopLoss').value = this.config.stopLoss;
    document.getElementById('minConfidence').value = this.config.minConfidence;
    document.getElementById('serverUrl').value = this.config.serverUrl || '';

    // Stats
    this.updateStats();
  }

  updateStats() {
    const profitEl = document.getElementById('profitLoss');
    profitEl.textContent = `R$ ${this.stats.totalProfit.toFixed(2)}`;
    profitEl.className = `stat-value ${this.stats.totalProfit >= 0 ? 'positive' : 'negative'}`;

    document.getElementById('todayBets').textContent = this.stats.totalBets;
    
    const winRate = this.stats.totalBets > 0 
      ? ((this.stats.wins / this.stats.totalBets) * 100).toFixed(1) 
      : 0;
    document.getElementById('winRate').textContent = `${winRate}%`;
    
    document.getElementById('currentGale').textContent = this.stats.currentGale;
  }

  updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connectionStatus');
    const textEl = statusEl.querySelector('.status-text');
    
    if (connected) {
      statusEl.classList.add('connected');
      textEl.textContent = 'Conectado';
    } else {
      statusEl.classList.remove('connected');
      textEl.textContent = 'Desconectado';
    }
  }

  updatePrediction(prediction) {
    const box = document.getElementById('lastPrediction');
    const text = box.querySelector('.prediction-text');
    
    box.className = `prediction-box ${prediction.color}`;
    text.textContent = `${prediction.color.toUpperCase()} - ${prediction.confidence}%`;
  }

  addLog(message, type = 'info') {
    const container = document.getElementById('logContainer');
    const entry = document.createElement('div');
    const time = new Date().toLocaleTimeString('pt-BR');
    
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${time}] ${message}`;
    
    container.insertBefore(entry, container.firstChild);
    
    // Keep only last 50 entries
    while (container.children.length > 50) {
      container.removeChild(container.lastChild);
    }
  }

  // ==================== EVENT LISTENERS ====================

  setupEventListeners() {
    // Save config button
    document.getElementById('saveConfigBtn').addEventListener('click', () => {
      this.saveConfig();
    });

    // Reset stats button
    document.getElementById('resetStatsBtn').addEventListener('click', async () => {
      if (confirm('Tem certeza que deseja resetar as estatísticas?')) {
        this.stats = {
          date: new Date().toDateString(),
          totalProfit: 0,
          totalBets: 0,
          wins: 0,
          losses: 0,
          currentGale: 0
        };
        await this.saveStats();
        this.updateStats();
        this.addLog('Estatísticas resetadas', 'warning');
      }
    });

    // Connect button
    document.getElementById('connectBtn').addEventListener('click', () => {
      this.connectToServer();
    });

    // Test button
    document.getElementById('testBtn').addEventListener('click', () => {
      this.testConnection();
    });

    // Auto bet toggle
    document.getElementById('autoBetEnabled').addEventListener('change', async (e) => {
      this.config.autoBetEnabled = e.target.checked;
      await this.saveConfig();
      
      if (e.target.checked) {
        this.addLog('Auto Bet ATIVADO', 'success');
      } else {
        this.addLog('Auto Bet DESATIVADO', 'warning');
      }
    });

    // Listen for messages from background/content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message);
    });
  }

  // ==================== COMMUNICATION ====================

  async connectToServer() {
    const serverUrl = document.getElementById('serverUrl').value;
    
    if (!serverUrl) {
      this.addLog('URL do servidor não definida', 'error');
      return;
    }

    this.addLog('Conectando ao servidor...', 'info');

    try {
      // Send connect message to background
      chrome.runtime.sendMessage({
        type: 'CONNECT_SERVER',
        serverUrl: serverUrl
      });
    } catch (error) {
      this.addLog(`Erro: ${error.message}`, 'error');
    }
  }

  async testConnection() {
    this.addLog('Testando comunicação...', 'info');

    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.url.includes('blaze')) {
        this.addLog('Abra a página da Blaze primeiro', 'warning');
        return;
      }

      // Send test message to content script
      chrome.tabs.sendMessage(tab.id, { type: 'TEST_CONNECTION' }, (response) => {
        if (chrome.runtime.lastError) {
          this.addLog('Content script não encontrado', 'error');
          return;
        }
        
        if (response && response.success) {
          this.addLog('Conexão com página OK', 'success');
          this.addLog(`Token JWT: ${response.hasToken ? 'Encontrado' : 'Não encontrado'}`, 
            response.hasToken ? 'success' : 'warning');
        }
      });
    } catch (error) {
      this.addLog(`Erro: ${error.message}`, 'error');
    }
  }

  handleMessage(message) {
    switch (message.type) {
      case 'CONNECTION_STATUS':
        this.updateConnectionStatus(message.connected);
        this.addLog(message.connected ? 'Servidor conectado' : 'Servidor desconectado', 
          message.connected ? 'success' : 'error');
        break;

      case 'NEW_PREDICTION':
        this.updatePrediction(message.prediction);
        this.addLog(`Nova previsão: ${message.prediction.color} (${message.prediction.confidence}%)`, 'info');
        break;

      case 'BET_PLACED':
        this.addLog(`Aposta: R$ ${message.amount} no ${message.color}`, 'info');
        break;

      case 'BET_RESULT':
        this.handleBetResult(message);
        break;

      case 'STATS_UPDATED':
        this.stats = message.stats;
        this.updateStats();
        break;

      case 'LOG':
        this.addLog(message.text, message.level || 'info');
        break;

      case 'ERROR':
        this.addLog(`Erro: ${message.error}`, 'error');
        break;
    }
  }

  async handleBetResult(message) {
    const { won, profit, galeLevel } = message;
    
    this.stats.totalBets++;
    this.stats.totalProfit += profit;
    
    if (won) {
      this.stats.wins++;
      this.stats.currentGale = 0;
      this.addLog(`✅ WIN! +R$ ${profit.toFixed(2)}`, 'success');
    } else {
      this.stats.losses++;
      this.stats.currentGale = galeLevel + 1;
      this.addLog(`❌ LOSS: -R$ ${Math.abs(profit).toFixed(2)}`, 'error');
    }

    // Update bankroll
    this.config.currentBankroll += profit;
    document.getElementById('currentBankroll').value = this.config.currentBankroll.toFixed(2);

    await this.saveStats();
    await this.saveConfig();
    this.updateStats();

    // Check stop conditions
    this.checkStopConditions();
  }

  checkStopConditions() {
    // Stop Win
    if (this.stats.totalProfit >= this.config.stopWin) {
      this.config.autoBetEnabled = false;
      document.getElementById('autoBetEnabled').checked = false;
      this.saveConfig();
      this.addLog(`🎉 STOP WIN atingido! +R$ ${this.stats.totalProfit.toFixed(2)}`, 'success');
    }

    // Stop Loss
    if (this.stats.totalProfit <= -this.config.stopLoss) {
      this.config.autoBetEnabled = false;
      document.getElementById('autoBetEnabled').checked = false;
      this.saveConfig();
      this.addLog(`⛔ STOP LOSS atingido! -R$ ${Math.abs(this.stats.totalProfit).toFixed(2)}`, 'error');
    }
  }

  // ==================== STATUS POLLING ====================

  startStatusPolling() {
    // Poll for status every 2 seconds
    setInterval(async () => {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
        if (response) {
          this.updateConnectionStatus(response.connected);
          if (response.lastPrediction) {
            this.updatePrediction(response.lastPrediction);
          }
        }
      } catch (error) {
        // Ignore errors during polling
      }
    }, 2000);
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
