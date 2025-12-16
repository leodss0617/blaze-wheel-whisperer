import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Chrome, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import type { PredictionSignal } from '@/types/blaze';

declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage: (extensionId: string, message: unknown, callback?: (response: unknown) => void) => void;
      };
    };
  }
}

interface ExtensionPanelProps {
  currentPrediction: PredictionSignal | null;
  betAmount: number;
  galeLevel: number;
}

export function ExtensionPanel({ currentPrediction, betAmount, galeLevel }: ExtensionPanelProps) {
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [lastSentSignal, setLastSentSignal] = useState<string | null>(null);

  useEffect(() => {
    const checkExtension = () => {
      try {
        const extensionCheck = localStorage.getItem('blaze-extension-installed');
        if (extensionCheck === 'true') {
          setExtensionInstalled(true);
        }
      } catch {
        setExtensionInstalled(false);
      }
    };

    checkExtension();
    const interval = setInterval(checkExtension, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (currentPrediction && currentPrediction.predictedColor !== 'white') {
      sendSignalToExtension(currentPrediction.predictedColor as 'red' | 'black', betAmount, currentPrediction.confidence);
    }
  }, [currentPrediction, betAmount, galeLevel]);

  const sendSignalToExtension = (color: 'red' | 'black', amount: number, confidence: number) => {
    const signal = {
      type: 'BET_SIGNAL',
      data: {
        color,
        amount,
        confidence,
        galeLevel,
        timestamp: Date.now()
      }
    };

    window.postMessage(signal, '*');

    try {
      localStorage.setItem('blaze-auto-bet-signal', JSON.stringify(signal.data));
      setLastSentSignal(`${color === 'red' ? 'VERMELHO' : 'PRETO'} - R$ ${amount.toFixed(2)}`);
    } catch (e) {
      console.error('Erro ao salvar sinal:', e);
    }

    try {
      const channel = new BroadcastChannel('blaze-auto-bet');
      channel.postMessage(signal);
      channel.close();
    } catch {
      // BroadcastChannel não suportado
    }

    console.log('📡 Sinal enviado para extensão:', signal);
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

  return (
    <Card className="bg-card/50 backdrop-blur border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Chrome className="h-4 w-4 text-primary" />
          Extensão Chrome
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Status:</span>
          <Badge variant={extensionInstalled ? 'default' : 'secondary'} className="text-xs">
            {extensionInstalled ? (
              <>
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Instalada
              </>
            ) : (
              <>
                <AlertCircle className="h-3 w-3 mr-1" />
                Não detectada
              </>
            )}
          </Badge>
        </div>

        {lastSentSignal && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Último sinal:</span>
            <span className="text-xs font-medium">{lastSentSignal}</span>
          </div>
        )}

        {!extensionInstalled && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Instale a extensão para automação de apostas no site da Blaze.
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

        {extensionInstalled && currentPrediction && currentPrediction.predictedColor !== 'white' && (
          <div className="p-2 rounded bg-primary/10 border border-primary/20">
            <p className="text-xs text-center">
              🎯 Sinal ativo: <strong>{currentPrediction.predictedColor === 'red' ? 'VERMELHO' : 'PRETO'}</strong>
            </p>
            <p className="text-xs text-center text-muted-foreground">
              A extensão irá apostar automaticamente
            </p>
          </div>
        )}

        <div className="text-xs text-muted-foreground border-t border-border pt-2">
          <p className="font-medium mb-1">Como funciona:</p>
          <ol className="list-decimal list-inside space-y-0.5 text-[10px]">
            <li>Instale a extensão no Chrome</li>
            <li>Abra o site do Blaze e faça login</li>
            <li>Ative a automação no painel da extensão</li>
            <li>Os sinais daqui serão executados automaticamente!</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
