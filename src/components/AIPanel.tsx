import { Brain, Zap, TrendingUp, Target } from 'lucide-react';
import { AIPrediction, AIStats } from '@/hooks/useAIPrediction';
import { ColorBall } from './ColorBall';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface AIPanelProps {
  prediction: AIPrediction | null;
  stats: AIStats | null;
  isLoading: boolean;
  useAI: boolean;
  onToggleAI: (enabled: boolean) => void;
  onRequestPrediction: () => void;
}

export function AIPanel({
  prediction,
  stats,
  isLoading,
  useAI,
  onToggleAI,
  onRequestPrediction,
}: AIPanelProps) {
  return (
    <div className="glass-card p-4 md:p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary animate-pulse" />
          <h2 className="text-lg font-display font-semibold neon-text">
            IA Adaptativa
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">IA</span>
          <Switch checked={useAI} onCheckedChange={onToggleAI} />
        </div>
      </div>

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
        </div>
        {stats && (
          <p className="text-xs text-muted-foreground">
            Analisou {stats.totalSignals} sinais • Taxa: {stats.winRate}%
          </p>
        )}
      </div>

      {/* Last AI Prediction */}
      {prediction && (
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <Zap className="h-3 w-3" />
            Última Previsão IA
          </p>
          <div className={cn(
            'p-3 rounded-lg',
            prediction.should_bet ? 'bg-primary/10 neon-border' : 'bg-muted/50'
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
          </div>
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

      {/* Request AI Prediction Button */}
      <Button
        onClick={onRequestPrediction}
        disabled={isLoading || !useAI}
        className="w-full mt-4"
        variant={useAI ? 'default' : 'secondary'}
      >
        {isLoading ? (
          <>
            <Brain className="h-4 w-4 mr-2 animate-spin" />
            Analisando...
          </>
        ) : (
          <>
            <Target className="h-4 w-4 mr-2" />
            Solicitar Previsão IA
          </>
        )}
      </Button>

      <p className="text-xs text-muted-foreground text-center mt-2">
        A IA aprende com cada resultado
      </p>
    </div>
  );
}
