import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, Chrome, CheckCircle2, AlertCircle, ExternalLink, Wifi, WifiOff, Activity, Shield, TestTube, Loader2 } from 'lucide-react';
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
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  // Send prediction to extension when it changes
  useEffect(() => {
    if (currentPrediction && currentPrediction.predictedColor !== 'white') {
      sendPrediction(currentPrediction, betAmount, galeLevel);
    }
  }, [currentPrediction, betAmount, galeLevel, sendPrediction]);

  // Send white protection signal when it changes
  useEffect(() => {
    if (whiteProtection && 
        whiteProtection.shouldProtect && 
        whiteProtection.id !== lastSentProtectionId.current &&
        isConnected) {
      lastSentProtectionId.current = whiteProtection.id;
      const protectionAmount = betAmount * (whiteProtection.suggestedAmount / 100);
      sendWhiteProtectionSignal(protectionAmount, whiteProtection.confidence);
    }
  }, [whiteProtection, betAmount, isConnected, sendWhiteProtectionSignal]);

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
    
    // Check for response
    setTimeout(() => {
      if (isConnected || extensionData.status.lastActivity) {
        setTestStatus('success');
        toast.success('Comunicação OK! Extensão respondeu.', {
          description: `Último sinal: ${testColor.toUpperCase()} - Teste`,
        });
      } else {
        setTestStatus('error');
        toast.error('Sem resposta da extensão', {
          description: 'Verifique se a extensão está instalada e a página do Blaze está aberta.',
        });
      }
      
      setTimeout(() => setTestStatus('idle'), 3000);
    }, 2000);
  };

  const downloadExtension = () => {
    alert(
      '📥 Para instalar a extensão:\n\n' +
      '1. Acesse o código do projeto\n' +
      '2. Baixe a pasta "chrome-extension"\n' +
      '3. Abra chrome://extensions\n' +
      '4. Ative "Modo do desenvolvedor"\n' +
      '5. Clique em "Carregar sem compactação"\n' +
      '6. Selecione a pasta baixada'
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
            Extensão Chrome
          </div>
          {isConnected && (
            <Activity className="h-3 w-3 text-green-400 animate-pulse" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Status */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Instalada:</span>
            <Badge variant={isInstalled ? 'default' : 'secondary'} className="text-[10px] px-1.5">
              {isInstalled ? (
                <><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Sim</>
              ) : (
                <><AlertCircle className="h-2.5 w-2.5 mr-0.5" /> Não</>
              )}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Conexão:</span>
            <Badge variant={isConnected ? 'default' : 'outline'} className="text-[10px] px-1.5">
              {isConnected ? (
                <><Wifi className="h-2.5 w-2.5 mr-0.5" /> Ativa</>
              ) : (
                <><WifiOff className="h-2.5 w-2.5 mr-0.5" /> Inativa</>
              )}
            </Badge>
          </div>
        </div>

        {/* Test Communication Button */}
        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs"
          onClick={testCommunication}
          disabled={testStatus === 'testing'}
        >
          {testStatus === 'testing' ? (
            <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Testando...</>
          ) : testStatus === 'success' ? (
            <><CheckCircle2 className="h-3 w-3 mr-1 text-green-400" /> Comunicação OK!</>
          ) : testStatus === 'error' ? (
            <><AlertCircle className="h-3 w-3 mr-1 text-red-400" /> Sem resposta</>
          ) : (
            <><TestTube className="h-3 w-3 mr-1" /> Testar Comunicação</>
          )}
        </Button>

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
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Último sinal:</span>
            <span className="font-medium text-primary">{extensionData.lastSignalSent}</span>
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

        {/* Active Signal */}
        {isConnected && currentPrediction && currentPrediction.predictedColor !== 'white' && (
          <div className="p-2 rounded bg-primary/10 border border-primary/20">
            <p className="text-xs text-center">
              🎯 Sinal ativo: <strong>{currentPrediction.predictedColor === 'red' ? 'VERMELHO' : 'PRETO'}</strong>
            </p>
            <p className="text-[10px] text-center text-muted-foreground">
              Extensão executará automaticamente
            </p>
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
        {isConnected && whiteProtection && whiteProtection.shouldProtect && (
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
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Instale a extensão para automação no site da Blaze.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs"
                onClick={downloadExtension}
              >
                <Download className="h-3 w-3 mr-1" />
                Instruções
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

        {/* How it works */}
        <div className="text-xs text-muted-foreground border-t border-border pt-2">
          <p className="font-medium mb-1">Comunicação bidirecional:</p>
          <ul className="list-disc list-inside space-y-0.5 text-[10px]">
            <li>App → Extensão: sinais de aposta</li>
            <li>Extensão → App: resultados em tempo real</li>
            <li>Sincronização via localStorage + BroadcastChannel</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
