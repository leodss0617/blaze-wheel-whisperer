import { PredictionSignal, PredictionState, BlazeRound } from '@/types/blaze';
import { ColorBall } from './ColorBall';
import { AlertTriangle, ArrowRight, Zap, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BetNotificationProps {
  currentPrediction: PredictionSignal | null;
  predictionState: PredictionState;
  currentBet: number;
  lastRound: BlazeRound | null;
  isConfigured: boolean;
}

export function BetNotification({
  currentPrediction,
  predictionState,
  currentBet,
  lastRound,
  isConfigured,
}: BetNotificationProps) {
  if (!isConfigured) {
    return (
      <div className="p-3 sm:p-4 rounded-lg bg-muted/30 border border-border/50">
        <p className="text-xs sm:text-sm text-muted-foreground text-center">
          Configure a banca para receber notificações de apostas
        </p>
      </div>
    );
  }

  if (predictionState === 'analyzing') {
    return (
      <div className="p-3 sm:p-4 rounded-lg bg-muted/30 border border-border/50">
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <p className="text-xs sm:text-sm text-muted-foreground">
            Analisando padrões...
          </p>
        </div>
        <p className="text-[10px] sm:text-xs text-muted-foreground text-center mt-2">
          Aguarde o próximo sinal para apostar
        </p>
      </div>
    );
  }

  if (!currentPrediction) return null;

  const isGale = predictionState === 'gale1' || predictionState === 'gale2';
  const galeNumber = predictionState === 'gale1' ? 1 : predictionState === 'gale2' ? 2 : 0;

  return (
    <div className={cn(
      "p-3 sm:p-4 rounded-lg border animate-pulse-neon",
      isGale 
        ? "bg-accent/10 border-accent/50" 
        : "bg-primary/10 border-primary/50"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <div className="flex items-center gap-2">
          <Zap className={cn(
            "h-4 w-4",
            isGale ? "text-accent" : "text-primary"
          )} />
          <span className={cn(
            "text-xs sm:text-sm font-bold uppercase tracking-wider",
            isGale ? "text-accent" : "text-primary"
          )}>
            {isGale ? `GALE ${galeNumber}` : 'ENTRADA'}
          </span>
        </div>
        <span className="text-[10px] sm:text-xs text-muted-foreground">
          {currentPrediction.confidence}% confiança
        </span>
      </div>

      {/* Bet Info */}
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm text-muted-foreground">Apostar:</span>
          <ColorBall color={currentPrediction.predictedColor} size="md" />
          <span className="font-bold text-sm sm:text-base">
            {currentPrediction.predictedColor === 'red' ? 'VERMELHO' : 'PRETO'}
          </span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className={cn(
          "text-lg sm:text-xl font-bold font-display",
          isGale ? "danger-text" : "neon-text"
        )}>
          R$ {currentBet.toFixed(2)}
        </div>
      </div>

      {/* After Round Info */}
      {lastRound && (
        <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-border/30">
          <p className="text-[10px] sm:text-xs text-muted-foreground">
            Apostar após a rodada #{lastRound.number}
          </p>
        </div>
      )}

      {/* Gale Warning */}
      {isGale && (
        <div className="mt-2 sm:mt-3 flex items-center gap-2 text-accent">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span className="text-[10px] sm:text-xs">
            {galeNumber === 2 
              ? 'Última tentativa! Após isso volta a analisar.' 
              : 'Recuperação com Martingale'}
          </span>
        </div>
      )}
    </div>
  );
}