import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Download, Chrome, CheckCircle2, AlertCircle, ExternalLink, Wifi, WifiOff, Activity, Shield, TestTube, Loader2, Play, Square, Zap } from 'lucide-react';
import { useExtensionBridge } from '@/hooks/useExtensionBridge';
import { ColorBall } from './ColorBall';
import { toast } from 'sonner';
import type { PredictionSignal } from '@/types/blaze';
import type { WhiteProtectionSignal } from '@/hooks/useWhiteProtectionAI';

interface ExtensionPanelProps {
  currentPrediction: PredictionSignal | null;
  betAmount: number;
  galeLevel: number;
  whiteProtection?: WhiteProtectionSignal | null;
  maxGales?: number;
  dailyTarget?: number;
  dailyLossLimit?: number;
  onExtensionResults?: (rounds: { color: string; number: number; timestamp: Date }[]) => void;
}

export function ExtensionPanel({ 
  currentPrediction, 
  betAmount, 
  galeLevel, 
  whiteProtection,
  maxGales = 2,
  dailyTarget,
  dailyLossLimit,
  onExtensionResults 
}: ExtensionPanelProps) {
  const {
    extensionData,
    sendPrediction,
    sendWhiteProtectionSignal,
    sendSignalToExtension,
    convertResultsToRounds,
    requestExtensionStatus,
    isInstalled,
    isConnected,
  } = useExtensionBridge();

  const lastSentProtectionId = useRef<string | null>(null);
  const lastSentPredictionId = useRef<string | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [autoSendEnabled, setAutoSendEnabled] = useState(() => {
    const saved = localStorage.getItem('blaze-auto-send-enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [signalsSent, setSignalsSent] = useState(0);

  // Save auto-send preference
  useEffect(() => {
    localStorage.setItem('blaze-auto-send-enabled', String(autoSendEnabled));
  }, [autoSendEnabled]);

  // Send prediction to extension when it changes
  useEffect(() => {
    if (!autoSendEnabled) return;
    
    if (currentPrediction && 
        currentPrediction.predictedColor !== 'white' &&
        currentPrediction.id !== lastSentPredictionId.current) {
      
      lastSentPredictionId.current = currentPrediction.id;
      const sent = sendPrediction(currentPrediction, betAmount, galeLevel);
      
      if (sent) {
        setSignalsSent(prev => prev + 1);
        console.log('📡 Sinal enviado para extensão:', {
          cor: currentPrediction.predictedColor,
          valor: betAmount,
          gale: galeLevel,
          confianca: currentPrediction.confidence
        });
        
        toast.success(`🎯 Sinal enviado para extensão!`, {
          description: `${currentPrediction.predictedColor === 'red' ? '🔴 VERMELHO' : '⚫ PRETO'} - R$ ${betAmount.toFixed(2)} - Gale ${galeLevel}`,
          duration: 4000,
        });
      }
    }
  }, [currentPrediction, betAmount, galeLevel, sendPrediction, autoSendEnabled]);

  // Send white protection signal when it changes
  useEffect(() => {
    if (!autoSendEnabled) return;
    
    if (whiteProtection && 
        whiteProtection.shouldProtect && 
        whiteProtection.id !== lastSentProtectionId.current) {
      lastSentProtectionId.current = whiteProtection.id;
      const protectionAmount = betAmount * (whiteProtection.suggestedAmount / 100);
      sendWhiteProtectionSignal(protectionAmount, whiteProtection.confidence);
      
      toast.info(`⚪ Proteção branco enviada`, {
        description: `R$ ${protectionAmount.toFixed(2)} - ${whiteProtection.confidence}% confiança`,
        duration: 3000,
      });
    }
  }, [whiteProtection, betAmount, sendWhiteProtectionSignal, autoSendEnabled]);

  // Notify parent about extension results
  useEffect(() => {
    if (onExtensionResults && extensionData.results.length > 0) {
      const rounds = convertResultsToRounds(extensionData.results);
      onExtensionResults(rounds);
    }
  }, [extensionData.results, onExtensionResults, convertResultsToRounds]);

  const testCommunication = () => {
    setTestStatus('testing');
    
    // Send a test signal
    const testColor = Math.random() > 0.5 ? 'red' : 'black';
    const sent = sendSignalToExtension(testColor as 'red' | 'black', 0.01, 100, 0, false);
    
    // Request status from extension
    requestExtensionStatus();
    
    toast.info(`🧪 Teste enviado: ${testColor === 'red' ? 'VERMELHO' : 'PRETO'}`, {
      description: 'Aguardando resposta da extensão...',
    });
    
    // Check for response
    setTimeout(() => {
      if (isConnected || extensionData.status.lastActivity) {
        setTestStatus('success');
        toast.success('✅ Comunicação OK!', {
          description: 'Extensão respondeu corretamente.',
        });
      } else {
        setTestStatus('error');
        toast.error('❌ Sem resposta da extensão', {
          description: 'Verifique se a extensão está instalada e a página do Blaze está aberta.',
        });
      }
      
      setTimeout(() => setTestStatus('idle'), 3000);
    }, 2000);
  };

  const manualSendSignal = () => {
    if (!currentPrediction || currentPrediction.predictedColor === 'white') {
      toast.error('Sem sinal ativo', {
        description: 'Aguarde uma previsão válida do sistema.',
      });
      return;
    }
    
    const sent = sendSignalToExtension(
      currentPrediction.predictedColor as 'red' | 'black',
      betAmount,
      currentPrediction.confidence,
      galeLevel,
      false
    );
    
    if (sent) {
      setSignalsSent(prev => prev + 1);
      toast.success('📤 Sinal enviado manualmente!', {
        description: `${currentPrediction.predictedColor === 'red' ? '🔴 VERMELHO' : '⚫ PRETO'} - R$ ${betAmount.toFixed(2)}`,
      });
    }
  };

  const downloadExtension = () => {
    toast.info('📥 Instruções de instalação', {
      description: 'Veja as instruções abaixo para instalar a extensão.',
      duration: 5000,
    });
    
    alert(
      '📥 INSTALAÇÃO DA EXTENSÃO\n\n' +
      '1️⃣ Baixe o código do projeto (GitHub)\n' +
      '2️⃣ Localize a pasta "chrome-extension"\n' +
      '3️⃣ Abra chrome://extensions no Chrome\n' +
      '4️⃣ Ative "Modo do desenvolvedor" (canto superior direito)\n' +
      '5️⃣ Clique em "Carregar sem compactação"\n' +
      '6️⃣ Selecione a pasta "chrome-extension"\n' +
      '7️⃣ Abra blaze.bet.br/games/double em uma nova aba\n' +
      '8️⃣ A extensão deve mostrar "Conectado" automaticamente\n\n' +
      '⚠️ Mantenha o Blaze aberto em uma aba para receber os sinais!'
    );
  };

  const recentResults = extensionData.results.slice(0, 10);
  const lastActivity = extensionData.status.lastActivity;
  const activityText = lastActivity 
    ? `${Math.round((Date.now() - lastActivity.getTime()) / 1000)}s atrás`
    : 'Sem atividade';

  return (
    <Card className="bg-card/50 backdrop-blur border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Chrome className="h-4 w-4 text-primary" />
            Auto Bet Extensão
          </div>
          <div className="flex items-center gap-2">
            {signalsSent > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {signalsSent} sinais
              </Badge>
            )}
            {isConnected && (
              <Activity className="h-3 w-3 text-green-400 animate-pulse" />
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Auto-Send Toggle */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-primary/10 border border-primary/30">
          <div className="flex items-center gap-2">
            {autoSendEnabled ? (
              <Zap className="h-4 w-4 text-yellow-400" />
            ) : (
              <Square className="h-4 w-4 text-muted-foreground" />
            )}
            <div>
              <p className="text-xs font-medium">Auto Bet</p>
              <p className="text-[10px] text-muted-foreground">
                {autoSendEnabled ? 'Enviando sinais automaticamente' : 'Desativado'}
              </p>
            </div>
          </div>
          <Switch
            checked={autoSendEnabled}
            onCheckedChange={setAutoSendEnabled}
          />
        </div>

        {/* Status */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Extensão:</span>
            <Badge variant={isInstalled ? 'default' : 'secondary'} className="text-[10px] px-1.5">
              {isInstalled ? (
                <><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Instalada</>
              ) : (
                <><AlertCircle className="h-2.5 w-2.5 mr-0.5" /> Não encontrada</>
              )}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Conexão:</span>
            <Badge variant={isConnected ? 'default' : 'outline'} className="text-[10px] px-1.5">
              {isConnected ? (
                <><Wifi className="h-2.5 w-2.5 mr-0.5" /> Ativa</>
              ) : (
                <><WifiOff className="h-2.5 w-2.5 mr-0.5" /> Aguardando</>
              )}
            </Badge>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={testCommunication}
            disabled={testStatus === 'testing'}
          >
            {testStatus === 'testing' ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Testando</>
            ) : testStatus === 'success' ? (
              <><CheckCircle2 className="h-3 w-3 mr-1 text-green-400" /> OK!</>
            ) : testStatus === 'error' ? (
              <><AlertCircle className="h-3 w-3 mr-1 text-red-400" /> Erro</>
            ) : (
              <><TestTube className="h-3 w-3 mr-1" /> Testar</>
            )}
          </Button>
          
          <Button
            size="sm"
            variant={currentPrediction ? 'default' : 'secondary'}
            className="text-xs"
            onClick={manualSendSignal}
            disabled={!currentPrediction || currentPrediction.predictedColor === 'white'}
          >
            <Play className="h-3 w-3 mr-1" />
            Enviar Agora
          </Button>
        </div>

        {/* Last Activity */}
        {isInstalled && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Última atividade:</span>
            <span className={isConnected ? 'text-green-400' : 'text-muted-foreground'}>
              {activityText}
            </span>
          </div>
        )}

        {/* Last Signal Sent */}
        {extensionData.lastSignalSent && (
          <div className="flex items-center justify-between text-xs p-2 rounded bg-muted/30">
            <span className="text-muted-foreground">Último sinal:</span>
            <span className="font-medium text-primary">{extensionData.lastSignalSent}</span>
          </div>
        )}

        {/* Active Signal */}
        {currentPrediction && currentPrediction.predictedColor !== 'white' && (
          <div className={`p-2 rounded border ${
            currentPrediction.predictedColor === 'red' 
              ? 'bg-red-500/20 border-red-500/40' 
              : 'bg-gray-700/40 border-gray-500/40'
          }`}>
            <p className="text-xs text-center font-medium">
              🎯 Sinal ativo: {currentPrediction.predictedColor === 'red' ? '🔴 VERMELHO' : '⚫ PRETO'}
            </p>
            <p className="text-[10px] text-center text-muted-foreground">
              R$ {betAmount.toFixed(2)} | {currentPrediction.confidence}% confiança | Gale {galeLevel}
            </p>
            {autoSendEnabled && (
              <p className="text-[10px] text-center text-green-400 mt-1">
                ✅ Enviado para extensão automaticamente
              </p>
            )}
          </div>
        )}

        {/* Extension Results */}
        {recentResults.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Resultados (extensão):</span>
              <span className="text-muted-foreground">{recentResults.length} recentes</span>
            </div>
            <ScrollArea className="h-[52px]">
              <div className="flex gap-1 flex-wrap">
                {recentResults.map((result, idx) => (
                  <ColorBall 
                    key={`${result.timestamp}-${idx}`}
                    color={result.color || 'white'}
                    number={result.number}
                    size="sm"
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Goal-based Betting Info */}
        {(dailyTarget || dailyLossLimit) && (
          <div className="p-2 rounded bg-muted/30 border border-border/30 space-y-1">
            <p className="text-[10px] font-medium text-center">📊 Configuração da Meta</p>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="text-center">
                <span className="text-muted-foreground">Aposta:</span>
                <span className="ml-1 font-bold text-primary">R$ {betAmount.toFixed(2)}</span>
              </div>
              <div className="text-center">
                <span className="text-muted-foreground">Gales:</span>
                <span className="ml-1 font-bold">{maxGales}</span>
              </div>
              {dailyTarget && (
                <div className="text-center">
                  <span className="text-muted-foreground">Meta:</span>
                  <span className="ml-1 font-bold text-green-400">R$ {dailyTarget.toFixed(2)}</span>
                </div>
              )}
              {dailyLossLimit && (
                <div className="text-center">
                  <span className="text-muted-foreground">Limite:</span>
                  <span className="ml-1 font-bold text-red-400">-R$ {dailyLossLimit.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* White Protection Status */}
        {whiteProtection && whiteProtection.shouldProtect && (
          <div className="p-2 rounded bg-white/10 border border-white/20">
            <div className="flex items-center justify-center gap-1.5">
              <Shield className="h-3 w-3 text-white" />
              <p className="text-xs text-center">
                ⚪ Proteção branco: <strong>R$ {(betAmount * (whiteProtection.suggestedAmount / 100)).toFixed(2)}</strong>
              </p>
            </div>
            <p className="text-[10px] text-center text-muted-foreground">
              {whiteProtection.confidence}% confiança • {whiteProtection.roundsSinceLastWhite} rodadas sem branco
            </p>
          </div>
        )}

        {/* Installation Instructions */}
        {!isInstalled && (
          <div className="space-y-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/30">
            <p className="text-xs text-yellow-400 font-medium">
              ⚠️ Extensão necessária para apostas automáticas
            </p>
            <p className="text-[10px] text-muted-foreground">
              A Blaze bloqueia apostas via API direta. Instale a extensão Chrome para que as apostas sejam feitas automaticamente na interface do site.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs"
                onClick={downloadExtension}
              >
                <Download className="h-3 w-3 mr-1" />
                Como instalar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs"
                onClick={() => window.open('https://blaze.bet.br/games/double', '_blank')}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Abrir Blaze
              </Button>
            </div>
          </div>
        )}

        {/* Connected but extension not on Blaze page */}
        {isInstalled && !isConnected && (
          <div className="space-y-2 p-2 rounded bg-blue-500/10 border border-blue-500/30">
            <p className="text-xs text-blue-400 font-medium">
              ℹ️ Extensão instalada, aguardando conexão
            </p>
            <p className="text-[10px] text-muted-foreground">
              Abra o site da Blaze (blaze.bet.br/games/double) em outra aba para ativar a conexão.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs"
              onClick={() => window.open('https://blaze.bet.br/games/double', '_blank')}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Abrir Blaze
            </Button>
          </div>
        )}

        {/* Quick Guide */}
        <div className="text-xs text-muted-foreground border-t border-border pt-2">
          <p className="font-medium mb-1">Como funciona:</p>
          <ul className="list-disc list-inside space-y-0.5 text-[10px]">
            <li>Sistema gera previsão → sinal enviado para extensão</li>
            <li>Extensão coloca aposta automaticamente no Blaze</li>
            <li>Mantenha a aba do Blaze aberta para funcionar</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
