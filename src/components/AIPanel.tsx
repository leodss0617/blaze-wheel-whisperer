import { Brain, Zap, TrendingUp, Loader2, RefreshCw } from 'lucide-react';
import { AIPrediction, AIStats } from '@/hooks/useAIPrediction';
import { ColorBall } from './ColorBall';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface AIPanelProps {
  prediction: AIPrediction | null;
  stats: AIStats | null;
  isLoading: boolean;
  useAI: boolean;
  onToggleAI: (enabled: boolean) => void;
  consecutiveLosses: number;
  isRecalibrating: boolean;
}

export function AIPanel({
  prediction,
  stats,
  isLoading,
  useAI,
  onToggleAI,
  consecutiveLosses,
  isRecalibrating,
}: AIPanelProps) {
  const needsRecalibration = consecutiveLosses >= 2;
  return (
    <div className={cn(
      'glass-card p-4 md:p-6 h-full',
      needsRecalibration && 'border-accent/50'
    )}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {isRecalibrating ? (
            <RefreshCw className="h-5 w-5 text-accent animate-spin" />
          ) : (
            <Brain className={cn("h-5 w-5 text-primary", isLoading && "animate-pulse")} />
          )}
          <h2 className="text-lg font-display font-semibold neon-text">
            {isRecalibrating ? 'Recalibrando...' : 'IA Adaptativa'}
          </h2>
          {isLoading && !isRecalibrating && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">IA</span>
          <Switch checked={useAI} onCheckedChange={onToggleAI} />
        </div>
      </div>

      {/* Recalibration Warning */}
      {needsRecalibration && useAI && (
        <div className="p-3 rounded-lg mb-4 border bg-accent/10 border-accent/30">
          <div className="flex items-center gap-2 mb-1">
            <RefreshCw className={cn("h-4 w-4 text-accent", isRecalibrating && "animate-spin")} />
            <span className="text-sm font-semibold text-accent">
              {isRecalibrating ? 'RECALIBRANDO...' : 'MODO RECALIBRAÇÃO'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {isRecalibrating 
              ? 'IA analisando novos padrões...'
              : `${consecutiveLosses} erros consecutivos - Próxima previsão será recalibrada`
            }
          </p>
        </div>
      )}

      {/* AI Status */}
      <div className={cn(
        'p-3 rounded-lg mb-4 border',
        useAI ? 'bg-primary/10 border-primary/30' : 'bg-muted/50 border-muted'
      )}>
        <div className="flex items-center gap-2 mb-2">
          <div className={cn(
            'h-2 w-2 rounded-full',
            useAI ? 'bg-primary animate-pulse' : 'bg-muted-foreground'
          )} />
          <span className="text-sm font-semibold">
            {useAI ? 'IA Ativa - Aprendendo' : 'IA Desativada'}
          </span>
          {consecutiveLosses > 0 && useAI && (
            <span className="text-xs text-accent ml-auto">
              {consecutiveLosses} erro{consecutiveLosses > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {stats && (
          <p className="text-xs text-muted-foreground">
            Analisou {stats.totalSignals} sinais • Taxa: {stats.winRate}%
          </p>
        )}
      </div>

      {/* Current AI Prediction */}
      {prediction && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Previsão Atual
            </p>
            {prediction.afterRound && (
              <div className="flex items-center gap-1 text-xs bg-muted/50 px-2 py-1 rounded">
                <span className="text-muted-foreground">Após rodada:</span>
                <ColorBall color={prediction.afterRound.color} size="xs" />
                <span className="font-semibold">{prediction.afterRound.number}</span>
              </div>
            )}
          </div>
          <div className={cn(
            'p-3 rounded-lg',
            prediction.should_bet ? 'bg-primary/10 neon-border animate-pulse-neon' : 'bg-muted/50'
          )}>
            <div className="flex items-center gap-3">
              <ColorBall color={prediction.predicted_color} size="md" />
              <div className="flex-1">
                <p className="font-semibold">
                  {prediction.predicted_color === 'red' ? 'VERMELHO' : 'PRETO'}
                </p>
                <p className="text-xs text-muted-foreground">{prediction.reason}</p>
              </div>
              <div className="text-right">
                <p className={cn(
                  'text-xl font-bold',
                  prediction.confidence >= 80 ? 'text-primary' : 
                  prediction.confidence >= 70 ? 'text-blaze-gold' : 'text-muted-foreground'
                )}>
                  {prediction.confidence}%
                </p>
                <p className="text-xs text-muted-foreground">confiança</p>
              </div>
            </div>
            {prediction.analysis && (
              <p className="text-xs text-muted-foreground mt-2 border-t border-border/50 pt-2">
                {prediction.analysis}
              </p>
            )}
            {!prediction.should_bet && (
              <p className="text-xs text-blaze-gold mt-2">
                ⚠️ Confiança baixa - Aguarde melhor oportunidade
              </p>
            )}
          </div>
        </div>
      )}

      {!prediction && useAI && (
        <div className="mb-4 p-4 rounded-lg bg-muted/50 text-center">
          <Brain className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">Aguardando dados...</p>
          <p className="text-xs text-muted-foreground">A IA analisará automaticamente</p>
        </div>
      )}

      {/* AI Stats */}
      {stats && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Análise em Tempo Real
          </p>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded-lg bg-muted/50 text-center">
              <p className="text-sm font-bold text-blaze-red">{stats.last20Stats.red}</p>
              <p className="text-xs text-muted-foreground">Vermelho/20</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/50 text-center">
              <p className="text-sm font-bold text-foreground">{stats.last20Stats.black}</p>
              <p className="text-xs text-muted-foreground">Preto/20</p>
            </div>
          </div>

          <div className="p-2 rounded-lg bg-muted/50">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Sequência atual:</span>
              <span className="text-sm font-semibold">
                {stats.currentStreak.count}x {stats.currentStreak.color === 'red' ? 'Vermelho' : stats.currentStreak.color === 'black' ? 'Preto' : 'Branco'}
              </span>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center mt-4">
        A IA aprende automaticamente com cada resultado
      </p>
    </div>
  );
}
