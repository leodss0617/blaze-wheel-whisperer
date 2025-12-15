import { useState, useEffect } from 'react';
import { Timer, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CountdownTimerProps {
  lastRoundTimestamp: Date | null;
  roundIntervalSeconds?: number;
}

export function CountdownTimer({ 
  lastRoundTimestamp, 
  roundIntervalSeconds = 30 
}: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isImminent, setIsImminent] = useState(false);

  useEffect(() => {
    if (!lastRoundTimestamp) {
      setTimeLeft(0);
      return;
    }

    const calculateTimeLeft = () => {
      const now = Date.now();
      const lastRoundTime = lastRoundTimestamp.getTime();
      const nextRoundTime = lastRoundTime + (roundIntervalSeconds * 1000);
      const remaining = Math.max(0, Math.ceil((nextRoundTime - now) / 1000));
      
      setTimeLeft(remaining);
      setIsImminent(remaining <= 5 && remaining > 0);
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 100);

    return () => clearInterval(interval);
  }, [lastRoundTimestamp, roundIntervalSeconds]);

  const formatTime = (seconds: number) => {
    if (seconds <= 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = lastRoundTimestamp 
    ? Math.max(0, Math.min(100, ((roundIntervalSeconds - timeLeft) / roundIntervalSeconds) * 100))
    : 0;

  return (
    <div className={cn(
      'glass-card p-3 sm:p-4 transition-all duration-300',
      isImminent && 'neon-border animate-pulse-neon'
    )}>
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <div className="flex items-center gap-2">
          <Timer className={cn(
            'h-4 w-4 sm:h-5 sm:w-5',
            isImminent ? 'text-accent animate-pulse' : 'text-primary'
          )} />
          <span className="text-xs sm:text-sm font-semibold">Próxima Rodada</span>
        </div>
        {timeLeft <= 0 && lastRoundTimestamp && (
          <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary animate-spin" />
        )}
      </div>

      {/* Countdown Display */}
      <div className="text-center mb-2 sm:mb-3">
        <p className={cn(
          'text-3xl sm:text-4xl font-display font-bold tracking-wider transition-colors',
          isImminent ? 'text-accent danger-text' : 
          timeLeft <= 10 ? 'text-blaze-gold' : 'neon-text'
        )}>
          {formatTime(timeLeft)}
        </p>
        {isImminent && (
          <p className="text-[10px] sm:text-xs text-accent mt-1 animate-pulse">
            🔥 PREPARE-SE!
          </p>
        )}
        {timeLeft <= 0 && lastRoundTimestamp && (
          <p className="text-[10px] sm:text-xs text-primary mt-1">
            Aguardando resultado...
          </p>
        )}
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 sm:h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className={cn(
            'h-full transition-all duration-300 rounded-full',
            isImminent ? 'bg-accent' : 
            timeLeft <= 10 ? 'bg-blaze-gold' : 'bg-primary'
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Status Text */}
      <p className="text-[10px] sm:text-xs text-muted-foreground text-center mt-1.5 sm:mt-2">
        {!lastRoundTimestamp ? (
          'Conecte para iniciar'
        ) : timeLeft <= 0 ? (
          'Rodada em andamento'
        ) : timeLeft <= 5 ? (
          'Última chance!'
        ) : timeLeft <= 10 ? (
          'Apostas fechando...'
        ) : (
          'Apostas abertas'
        )}
      </p>
    </div>
  );
}
