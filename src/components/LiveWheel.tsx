import { BlazeRound } from '@/types/blaze';
import { ColorBall } from './ColorBall';
import { cn } from '@/lib/utils';

interface LiveWheelProps {
  lastRound: BlazeRound | null;
}

export function LiveWheel({ lastRound }: LiveWheelProps) {
  return (
    <div className="glass-card p-6 md:p-8">
      <div className="relative flex flex-col items-center">
        {/* Outer glow ring */}
        <div className={cn(
          'absolute inset-0 rounded-full opacity-30 blur-xl transition-all duration-500',
          lastRound?.color === 'red' && 'bg-red-600',
          lastRound?.color === 'black' && 'bg-zinc-700',
          lastRound?.color === 'white' && 'bg-white',
          !lastRound && 'bg-primary'
        )} />

        {/* Main display */}
        <div className="relative">
          <div className={cn(
            'w-32 h-32 md:w-40 md:h-40 rounded-full flex items-center justify-center transition-all duration-500',
            'border-4',
            lastRound?.color === 'red' && 'border-red-600 shadow-[0_0_40px_rgba(220,38,38,0.5)]',
            lastRound?.color === 'black' && 'border-zinc-600 shadow-[0_0_40px_rgba(63,63,70,0.5)]',
            lastRound?.color === 'white' && 'border-white shadow-[0_0_40px_rgba(255,255,255,0.5)]',
            !lastRound && 'border-primary shadow-[0_0_40px_hsl(var(--primary)/0.3)]'
          )}>
            {lastRound ? (
              <div className="text-center animate-fade-in">
                <ColorBall 
                  color={lastRound.color} 
                  number={lastRound.number} 
                  size="lg" 
                  showNumber 
                />
                <p className={cn(
                  'mt-3 text-sm font-display font-bold uppercase tracking-wider',
                  lastRound.color === 'red' && 'text-red-500',
                  lastRound.color === 'black' && 'text-zinc-400',
                  lastRound.color === 'white' && 'text-white'
                )}>
                  {lastRound.color === 'red' ? 'Vermelho' : 
                   lastRound.color === 'black' ? 'Preto' : 'Branco'}
                </p>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-muted animate-pulse" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Aguardando...
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute -inset-4 rounded-full border border-border/30 pointer-events-none" />
        <div className="absolute -inset-8 rounded-full border border-border/20 pointer-events-none" />
      </div>
    </div>
  );
}
