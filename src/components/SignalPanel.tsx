import { PredictionSignal } from '@/types/blaze';
import { ColorBall } from './ColorBall';
import { Target, CheckCircle2, XCircle, Clock, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SignalPanelProps {
  signals: PredictionSignal[];
}

export function SignalPanel({ signals }: SignalPanelProps) {
  const recentSignals = [...signals].reverse();
  const pendingSignal = recentSignals.find(s => s.status === 'pending');
  const historySignals = recentSignals.filter(s => s.status !== 'pending').slice(0, 10);

  const wins = signals.filter(s => s.status === 'win').length;
  const losses = signals.filter(s => s.status === 'loss').length;
  const total = wins + losses;
  const winRate = total > 0 ? (wins / total) * 100 : 0;

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

      {signals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Target className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">Analisando padrões...</p>
          <p className="text-xs mt-1">Sinais aparecerão aqui</p>
        </div>
      ) : (
        <>
          {/* Active Signal */}
          {pendingSignal && (
            <div className="mb-4 p-4 rounded-xl neon-border bg-primary/5 animate-pulse-neon">
              <div className="flex items-center gap-2 mb-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                  Sinal Ativo
                </span>
              </div>
              
              <div className="flex items-center gap-4">
                <ColorBall color={pendingSignal.predictedColor} size="lg" />
                <div className="flex-1">
                  <p className="font-display font-bold text-lg">
                    {pendingSignal.predictedColor === 'red' ? 'VERMELHO' : 'PRETO'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {pendingSignal.reason}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold neon-text">
                    {pendingSignal.confidence}%
                  </p>
                  <div className="flex items-center gap-1 mt-1 text-muted-foreground">
                    <Shield className="h-3 w-3" />
                    <span className="text-xs">{pendingSignal.protections} proteções</span>
                  </div>
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
                      <p className="text-xs text-muted-foreground">
                        {signal.confidence}% confiança
                      </p>
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
        </>
      )}
    </div>
  );
}
