import { Wifi, WifiOff, Play, Square, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConnectionStatus } from '@/types/blaze';
import { cn } from '@/lib/utils';

interface ConnectionPanelProps {
  status: ConnectionStatus;
  isSimulating: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onStartSimulation: () => void;
  onStopSimulation: () => void;
}

export function ConnectionPanel({
  status,
  isSimulating,
  onConnect,
  onDisconnect,
  onStartSimulation,
  onStopSimulation,
}: ConnectionPanelProps) {
  const statusConfig = {
    disconnected: {
      color: 'text-muted-foreground',
      icon: WifiOff,
      label: 'Desconectado',
      bgColor: 'bg-muted',
    },
    connecting: {
      color: 'text-blaze-gold',
      icon: Wifi,
      label: 'Conectando...',
      bgColor: 'bg-blaze-gold/20',
    },
    connected: {
      color: 'text-primary',
      icon: Wifi,
      label: isSimulating ? 'Simulando' : 'Conectado',
      bgColor: 'bg-primary/20',
    },
    error: {
      color: 'text-accent',
      icon: WifiOff,
      label: 'Erro',
      bgColor: 'bg-accent/20',
    },
  };

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <div className="glass-card p-4 md:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg', config.bgColor)}>
            <StatusIcon className={cn('h-5 w-5', config.color)} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <p className={cn('font-semibold font-display', config.color)}>
              {config.label}
            </p>
          </div>
          {status === 'connected' && (
            <div className="flex items-center gap-1.5 ml-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              <span className="text-xs text-primary">LIVE</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {status === 'disconnected' || status === 'error' ? (
            <>
              <Button
                onClick={onConnect}
                className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Zap className="h-4 w-4" />
                Conectar Blaze
              </Button>
              <Button
                onClick={onStartSimulation}
                variant="outline"
                className="gap-2 border-blaze-gold text-blaze-gold hover:bg-blaze-gold/10"
              >
                <Play className="h-4 w-4" />
                Simular
              </Button>
            </>
          ) : (
            <Button
              onClick={isSimulating ? onStopSimulation : onDisconnect}
              variant="outline"
              className="gap-2 border-accent text-accent hover:bg-accent/10"
            >
              <Square className="h-4 w-4" />
              Parar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
