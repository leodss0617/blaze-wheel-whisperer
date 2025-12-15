import { PredictionSignal, PredictionState } from '@/types/blaze';
import { ColorBall } from './ColorBall';
import { Target, CheckCircle2, XCircle, Loader2, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SignalPanelProps {
  signals: PredictionSignal[];
  predictionState: PredictionState;
  currentPrediction: PredictionSignal | null;
  roundsUntilNextPrediction?: number;
}

export function SignalPanel({ signals, predictionState, currentPrediction, roundsUntilNextPrediction = 0 }: SignalPanelProps) {
  const historySignals = [...signals]
    .reverse()
    .filter(s => s.status !== 'pending')
    .slice(0, 10);

  const wins = signals.filter(s => s.status === 'win').length;
  const losses = signals.filter(s => s.status === 'loss').length;
  const total = wins + losses;
  const winRate = total > 0 ? (wins / total) * 100 : 0;

  const isAnalyzing = predictionState === 'analyzing';
  const isGale = predictionState === 'gale1' || predictionState === 'gale2';

  return (
    <div className="glass-card p-4 md:p-6 h-full">
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-display font-semibold neon-text">
          Sinais
        </h2>
        {total > 0 && (
          <span className={cn(
            'ml-auto text-sm font-semibold',
            winRate >= 60 ? 'text-primary' : winRate >= 40 ? 'text-blaze-gold' : 'text-accent'
          )}>
            {winRate.toFixed(0)}% Win
          </span>
        )}
      </div>

      {/* Current State Display */}
      {isAnalyzing ? (
        <div className="mb-4 p-4 rounded-xl bg-muted/30 border border-border/50">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm font-semibold text-muted-foreground">
              Analisando padrões...
            </span>
          </div>
          {roundsUntilNextPrediction > 0 ? (
            <div className="mt-3 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/20 border border-primary/30">
                <span className="text-2xl font-bold text-primary">{roundsUntilNextPrediction}</span>
                <span className="text-xs text-primary/80">
                  {roundsUntilNextPrediction === 1 ? 'rodada' : 'rodadas'} restante{roundsUntilNextPrediction !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-primary text-center mt-2 font-semibold">
              Próxima previsão a qualquer momento...
            </p>
          )}
        </div>
      ) : currentPrediction && (
        <div className={cn(
          "mb-4 p-4 rounded-xl animate-pulse-neon",
          isGale 
            ? "neon-border-accent bg-accent/5" 
            : "neon-border bg-primary/5"
        )}>
          <div className="flex items-center gap-2 mb-2">
            <span className="relative flex h-2 w-2">
              <span className={cn(
                "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                isGale ? "bg-accent" : "bg-primary"
              )}></span>
              <span className={cn(
                "relative inline-flex rounded-full h-2 w-2",
                isGale ? "bg-accent" : "bg-primary"
              )}></span>
            </span>
            <span className={cn(
              "text-xs font-semibold uppercase tracking-wider",
              isGale ? "text-accent" : "text-primary"
            )}>
              {isGale 
                ? `Gale ${predictionState === 'gale1' ? '1' : '2'} Ativo` 
                : 'Sinal Ativo'}
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <ColorBall color={currentPrediction.predictedColor} size="lg" />
            <div className="flex-1">
              <p className="font-display font-bold text-lg">
                {currentPrediction.predictedColor === 'red' ? 'VERMELHO' : 'PRETO'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {currentPrediction.reason}
              </p>
            </div>
            <div className="text-right">
              <p className={cn(
                "text-2xl font-bold",
                isGale ? "danger-text" : "neon-text"
              )}>
                {currentPrediction.confidence}%
              </p>
              {!isGale && (
                <div className="flex items-center gap-1 mt-1 text-muted-foreground">
                  <Shield className="h-3 w-3" />
                  <span className="text-xs">2 gales</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center p-2 rounded-lg bg-muted/50">
          <p className="text-lg font-bold text-primary">{wins}</p>
          <p className="text-xs text-muted-foreground">Wins</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-muted/50">
          <p className="text-lg font-bold text-accent">{losses}</p>
          <p className="text-xs text-muted-foreground">Losses</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-muted/50">
          <p className="text-lg font-bold text-blaze-gold">{total}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </div>
      </div>

      {/* History */}
      {historySignals.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Histórico de Sinais</p>
          <ScrollArea className="h-[200px]">
            <div className="space-y-2">
              {historySignals.map((signal) => (
                <div
                  key={signal.id}
                  className={cn(
                    'flex items-center gap-3 p-2 rounded-lg',
                    signal.status === 'win' ? 'bg-primary/10' : 'bg-accent/10'
                  )}
                >
                  <ColorBall color={signal.predictedColor} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{signal.reason}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{signal.confidence}% confiança</span>
                      {signal.galeLevel > 0 && (
                        <span className="text-blaze-gold">• Gale {signal.galeLevel}</span>
                      )}
                      {signal.status === 'loss' && signal.actualResult && (
                        <span className="flex items-center gap-1 text-accent">
                          • Saiu: <ColorBall color={signal.actualResult} size="xs" />
                        </span>
                      )}
                    </div>
                  </div>
                  {signal.status === 'win' ? (
                    <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-accent flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {historySignals.length === 0 && isAnalyzing && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Target className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-xs">Histórico de sinais aparecerá aqui</p>
        </div>
      )}
    </div>
  );
}
