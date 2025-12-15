import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

export function BrasiliaClockDisplay() {
  const [time, setTime] = useState<string>('');
  const [date, setDate] = useState<string>('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      
      // Format time in Brasília timezone (America/Sao_Paulo)
      const timeOptions: Intl.DateTimeFormatOptions = {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      };
      
      const dateOptions: Intl.DateTimeFormatOptions = {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      };
      
      setTime(now.toLocaleTimeString('pt-BR', timeOptions));
      setDate(now.toLocaleDateString('pt-BR', dateOptions));
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-background/50 border border-border/50 rounded-lg">
      <Clock className="h-4 w-4 text-primary animate-pulse" />
      <div className="flex flex-col items-center">
        <span className="text-sm font-mono font-bold text-primary tabular-nums">
          {time}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {date} • Brasília
        </span>
      </div>
    </div>
  );
}

// Utility function to get current Brasília time
export function getBrasiliaTime(): Date {
  const now = new Date();
  // Get the offset for Brasília (UTC-3)
  const brasiliaOffset = -3 * 60; // -3 hours in minutes
  const localOffset = now.getTimezoneOffset(); // Local offset in minutes
  const diff = brasiliaOffset - (-localOffset); // Difference in minutes
  
  return new Date(now.getTime() + diff * 60 * 1000);
}

// Format a date to Brasília timezone string
export function formatBrasiliaTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

// Convert any date to Brasília timezone for comparison
export function toBrasiliaTimestamp(date: Date): number {
  // Get the time in Brasília timezone
  const brasiliaString = date.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  return new Date(brasiliaString).getTime();
}
