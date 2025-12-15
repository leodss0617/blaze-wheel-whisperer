import { BlazeStats } from '@/types/blaze';
import { ColorBall } from './ColorBall';
import { BarChart3, TrendingUp, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsPanelProps {
  stats: BlazeStats | null;
}

export function StatsPanel({ stats }: StatsPanelProps) {
  if (!stats) {
    return (
      <div className="glass-card p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-display font-semibold neon-text">
            Estatísticas
          </h2>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <p className="text-sm">Sem dados suficientes</p>
        </div>
      </div>
    );
  }

  const StatBar = ({ 
    color, 
    percentage, 
    count 
  }: { 
    color: 'red' | 'black' | 'white'; 
    percentage: number; 
    count: number;
  }) => {
    const bgColors = {
      red: 'bg-red-600',
      black: 'bg-zinc-700',
      white: 'bg-white',
    };

    const glowColors = {
      red: 'shadow-[0_0_10px_rgba(220,38,38,0.5)]',
      black: 'shadow-none',
      white: 'shadow-[0_0_10px_rgba(255,255,255,0.5)]',
    };

    return (
      <div className="flex items-center gap-3">
        <ColorBall color={color} size="sm" />
        <div className="flex-1">
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                bgColors[color],
                glowColors[color]
              )}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
        <div className="text-right min-w-[80px]">
          <span className="text-sm font-semibold">{percentage.toFixed(1)}%</span>
          <span className="text-xs text-muted-foreground ml-1">({count})</span>
        </div>
      </div>
    );
  };

  return (
    <div className="glass-card p-4 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-display font-semibold neon-text">
          Estatísticas
        </h2>
      </div>

      <div className="space-y-4">
        <StatBar color="red" percentage={stats.redPercentage} count={stats.redCount} />
        <StatBar color="black" percentage={stats.blackPercentage} count={stats.blackCount} />
        <StatBar color="white" percentage={stats.whitePercentage} count={stats.whiteCount} />
      </div>

      <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-red-500" />
          <div>
            <p className="text-xs text-muted-foreground">Max Vermelho</p>
            <p className="font-semibold text-red-500">{stats.maxRedStreak}x</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-zinc-400" />
          <div>
            <p className="text-xs text-muted-foreground">Max Preto</p>
            <p className="font-semibold text-zinc-400">{stats.maxBlackStreak}x</p>
          </div>
        </div>
      </div>

      {stats.currentStreak.count >= 2 && (
        <div className="mt-4 p-3 rounded-lg bg-muted/50 flex items-center gap-3">
          <Flame className={cn(
            'h-5 w-5',
            stats.currentStreak.color === 'red' ? 'text-red-500' : 
            stats.currentStreak.color === 'black' ? 'text-zinc-400' : 'text-white'
          )} />
          <div>
            <p className="text-xs text-muted-foreground">Sequência Atual</p>
            <p className="font-semibold">
              {stats.currentStreak.count}x{' '}
              {stats.currentStreak.color === 'red' ? 'VERMELHO' : 
               stats.currentStreak.color === 'black' ? 'PRETO' : 'BRANCO'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
