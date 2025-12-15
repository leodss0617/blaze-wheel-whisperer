import { BlazeRound } from '@/types/blaze';
import { ColorBall } from './ColorBall';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Clock } from 'lucide-react';

interface HistoryPanelProps {
  rounds: BlazeRound[];
}

export function HistoryPanel({ rounds }: HistoryPanelProps) {
  const recentRounds = [...rounds].reverse().slice(0, 50);

  return (
    <div className="glass-card p-4 md:p-6 h-full">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-display font-semibold neon-text">
          Histórico
        </h2>
        <span className="text-sm text-muted-foreground ml-auto">
          {rounds.length} rodadas
        </span>
      </div>

      {rounds.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <p className="text-sm">Aguardando dados...</p>
          <p className="text-xs mt-1">Conecte-se para começar</p>
        </div>
      ) : (
        <ScrollArea className="h-[300px]">
          <div className="flex flex-wrap gap-2">
            {recentRounds.map((round, index) => (
              <ColorBall
                key={round.id}
                color={round.color}
                number={round.number}
                size="sm"
                showNumber
                animate={index === 0}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {rounds.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">Últimas 10:</p>
          <div className="flex gap-1.5">
            {[...rounds].slice(-10).reverse().map((round) => (
              <ColorBall
                key={round.id}
                color={round.color}
                number={round.number}
                size="sm"
                showNumber
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
