import { PredictionSignal } from '@/types/blaze';
import { formatBrasiliaTime } from '@/components/BrasiliaClockDisplay';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { History, CheckCircle2, XCircle, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { ColorBall } from '@/components/ColorBall';

interface BetHistoryPanelProps {
  signals: PredictionSignal[];
}

export function BetHistoryPanel({ signals }: BetHistoryPanelProps) {
  // Filter only completed signals (win or loss) and sort by most recent first
  const completedBets = signals
    .filter(s => s.status === 'win' || s.status === 'loss')
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const wins = completedBets.filter(s => s.status === 'win').length;
  const losses = completedBets.filter(s => s.status === 'loss').length;
  const total = wins + losses;
  const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';

  // Calculate profit/loss streak
  const currentStreak = completedBets.length > 0 ? getStreak(completedBets) : { type: 'none', count: 0 };

  function getStreak(bets: PredictionSignal[]): { type: 'win' | 'loss' | 'none'; count: number } {
    if (bets.length === 0) return { type: 'none', count: 0 };
    
    const firstStatus = bets[0].status;
    let count = 0;
    
    for (const bet of bets) {
      if (bet.status === firstStatus) {
        count++;
      } else {
        break;
      }
    }
    
    return { type: firstStatus as 'win' | 'loss', count };
  }

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <History className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            Histórico de Apostas
          </CardTitle>
          <div className="flex items-center gap-2">
            {currentStreak.type !== 'none' && currentStreak.count > 1 && (
              <Badge 
                variant="outline" 
                className={`text-[10px] ${
                  currentStreak.type === 'win' 
                    ? 'border-primary/50 text-primary' 
                    : 'border-accent/50 text-accent'
                }`}
              >
                {currentStreak.type === 'win' ? (
                  <TrendingUp className="h-3 w-3 mr-1" />
                ) : (
                  <TrendingDown className="h-3 w-3 mr-1" />
                )}
                {currentStreak.count}x {currentStreak.type === 'win' ? 'WIN' : 'LOSS'}
              </Badge>
            )}
          </div>
        </div>
        
        {/* Stats Summary */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <p className="text-[10px] text-muted-foreground">Total</p>
            <p className="text-sm font-bold">{total}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-primary/10">
            <p className="text-[10px] text-muted-foreground">Wins</p>
            <p className="text-sm font-bold text-primary">{wins}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-accent/10">
            <p className="text-[10px] text-muted-foreground">Losses</p>
            <p className="text-sm font-bold text-accent">{losses}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-blaze-gold/10">
            <p className="text-[10px] text-muted-foreground">Win Rate</p>
            <p className="text-sm font-bold text-blaze-gold">{winRate}%</p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {completedBets.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma aposta registrada</p>
            <p className="text-xs">O histórico aparecerá aqui após as previsões</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px] pr-2">
            <div className="space-y-2">
              {completedBets.map((bet, index) => (
                <div
                  key={bet.id}
                  className={`p-3 rounded-lg border transition-all ${
                    bet.status === 'win'
                      ? 'bg-primary/5 border-primary/30 hover:bg-primary/10'
                      : 'bg-accent/5 border-accent/30 hover:bg-accent/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    {/* Status Icon & Time */}
                    <div className="flex items-center gap-2 min-w-0">
                      {bet.status === 'win' ? (
                        <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-accent flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs font-mono text-muted-foreground">
                            {formatBrasiliaTime(bet.timestamp)}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {bet.timestamp.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                        </p>
                      </div>
                    </div>
                    
                    {/* Prediction & Result */}
                    <div className="flex items-center gap-3">
                      {/* What was predicted */}
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[8px] uppercase text-muted-foreground">Previsto</span>
                        <ColorBall 
                          color={bet.predictedColor} 
                          size="sm"
                        />
                      </div>
                      
                      {/* Arrow */}
                      <span className="text-muted-foreground">→</span>
                      
                      {/* Actual result */}
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[8px] uppercase text-muted-foreground">Resultado</span>
                        {bet.actualResult ? (
                          <ColorBall 
                            color={bet.actualResult} 
                            size="sm"
                          />
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-muted/50 flex items-center justify-center">
                            <span className="text-[8px]">?</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Gale indicator */}
                      {bet.galeLevel > 0 && (
                        <Badge 
                          variant="outline" 
                          className="text-[8px] px-1.5 py-0 h-4 border-blaze-gold/50 text-blaze-gold"
                        >
                          G{bet.galeLevel}
                        </Badge>
                      )}
                    </div>
                    
                    {/* Result Badge */}
                    <Badge 
                      className={`text-[10px] px-2 ${
                        bet.status === 'win'
                          ? 'bg-primary/20 text-primary hover:bg-primary/30'
                          : 'bg-accent/20 text-accent hover:bg-accent/30'
                      }`}
                    >
                      {bet.status === 'win' ? 'WIN' : 'LOSS'}
                    </Badge>
                  </div>
                  
                  {/* Reason - collapsed */}
                  <p className="text-[10px] text-muted-foreground mt-2 line-clamp-1">
                    {bet.reason}
                  </p>
                  
                  {/* Confidence */}
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1 bg-muted/30 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${
                          bet.confidence >= 80 ? 'bg-primary' : 
                          bet.confidence >= 70 ? 'bg-blaze-gold' : 'bg-muted-foreground'
                        }`}
                        style={{ width: `${bet.confidence}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {bet.confidence}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
