# Blaze Auto Bet - Extensão Chrome

## Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                    SISTEMA DE APOSTAS AUTOMÁTICAS               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     WebSocket      ┌──────────────────────┐   │
│  │  Servidor   │◄──────────────────►│  Background Script   │   │
│  │  Previsões  │                    │  (Service Worker)    │   │
│  └─────────────┘                    └──────────┬───────────┘   │
│                                                │               │
│                                     chrome.runtime.sendMessage │
│                                                │               │
│  ┌─────────────┐                    ┌──────────▼───────────┐   │
│  │   Popup     │◄──────────────────►│   Content Script     │   │
│  │   (UI)      │   chrome.storage   │   (Página Blaze)     │   │
│  └─────────────┘                    └──────────┬───────────┘   │
│                                                │               │
│                                      DOM + Fetch API           │
│                                                │               │
│                                     ┌──────────▼───────────┐   │
│                                     │     Blaze API        │   │
│                                     │  (JWT Authorization) │   │
│                                     └──────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Instalação

1. Abra `chrome://extensions/`
2. Ative "Modo do desenvolvedor"
3. Clique "Carregar sem compactação"
4. Selecione a pasta `chrome-extension`

## Componentes

### manifest.json
- Manifest V3
- Permissões: storage, activeTab, scripting, alarms
- Host permissions para domínios Blaze

### background.js (Service Worker)
- Conexão WebSocket com servidor de previsões
- Gerenciamento de estado global
- Cálculo de apostas e gale
- Reconexão automática

### content.js
- Injetado na página da Blaze
- Extrai JWT token do localStorage
- Monitora estado do jogo (betting/rolling/result)
- Executa apostas via API ou DOM
- Overlay visual na página

### popup.html/js/css
- Interface de configuração
- Estatísticas em tempo real
- Logs de atividade

## Fluxo de Apostas

1. **Servidor envia previsão** → Background recebe via WebSocket
2. **Background valida** → Confiança >= mínima? Banca suficiente?
3. **Background calcula aposta** → Base × Multiplicador^Gale
4. **Content script executa** → API ou clique DOM
5. **Resultado detectado** → Content script notifica Background
6. **Atualiza estatísticas** → Win/Loss, próximo gale

## Proteções

- Stop Win: Para quando lucro >= meta
- Stop Loss: Para quando prejuízo >= limite
- Máximo de Gales: Limita sequência de martingale
- Confiança mínima: Ignora previsões fracas

## Autenticação

Token JWT extraído automaticamente:
```javascript
window.localStorage.getItem("ACCESS_TOKEN")
```

Usado no header:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
