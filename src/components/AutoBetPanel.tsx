import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Bot, 
  Wallet, 
  Target, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw,
  Power,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Zap,
  Shield,
} from 'lucide-react';
import { useAutoBet } from '@/hooks/useAutoBet';
import { PredictionSignal, PredictionState, BlazeRound } from '@/types/blaze';

interface AutoBetPanelProps {
  predictionState: PredictionState;
  currentPrediction: PredictionSignal | null;
  galeLevel: number;
  lastRound: BlazeRound | null;
}

export function AutoBetPanel({ 
  predictionState, 
  currentPrediction, 
  galeLevel,
  lastRound 
}: AutoBetPanelProps) {
  const {
    config,
    stats,
    isConnected,
    isLoading,
    isBetting,
    currentGale,
    connectionError,
    checkBalance,
    handlePrediction,
    recordResult,
    toggleAutoBet,
    updateConfig,
    resetStats,
    calculateBet,
  } = useAutoBet();

  // Auto-bet when prediction changes
  useEffect(() => {
    if (config.enabled && currentPrediction && predictionState !== 'analyzing') {
      handlePrediction(currentPrediction, predictionState, galeLevel);
    }
  }, [config.enabled, currentPrediction, predictionState, galeLevel, handlePrediction]);

  const winRate = stats.totalBets > 0 
    ? ((stats.wins / stats.totalBets) * 100).toFixed(1) 
    : '0.0';

  const profitProgress = config.targetProfit > 0 
    ? Math.min(100, Math.max(0, (stats.totalProfit / config.targetProfit) * 100))
    : 0;

  const lossProgress = config.stopLoss > 0 
    ? Math.min(100, Math.max(0, (Math.abs(Math.min(0, stats.totalProfit)) / config.stopLoss) * 100))
    : 0;

  const nextBetAmount = calculateBet(galeLevel);

  return (
    <Card className="neon-border bg-card/80 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Automação
          </CardTitle>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Badge variant="outline" className="border-primary/50 text-primary text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Conectado
              </Badge>
            ) : (
              <Badge variant="outline" className="border-destructive/50 text-destructive text-xs">
                <XCircle className="h-3 w-3 mr-1" />
                Desconectado
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Balance & Connection */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-blaze-gold" />
            <span className="text-sm text-muted-foreground">Saldo:</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-blaze-gold">
              R$ {(typeof stats.balance === 'number' ? stats.balance : 0).toFixed(2)}
            </span>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 w-7 p-0"
              onClick={checkBalance}
              disabled={isLoading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Config Section */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Meta (R$)</Label>
            <Input
              type="number"
              value={config.targetProfit}
              onChange={(e) => updateConfig({ targetProfit: parseFloat(e.target.value) || 0 })}
              className="h-8 text-sm"
              disabled={config.enabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Stop Loss (R$)</Label>
            <Input
              type="number"
              value={config.stopLoss}
              onChange={(e) => updateConfig({ stopLoss: parseFloat(e.target.value) || 0 })}
              className="h-8 text-sm"
              disabled={config.enabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Aposta Base (R$)</Label>
            <Input
              type="number"
              value={config.baseBet}
              onChange={(e) => updateConfig({ baseBet: parseFloat(e.target.value) || 0 })}
              className="h-8 text-sm"
              disabled={config.enabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Máx. Gales</Label>
            <Input
              type="number"
              min={0}
              max={3}
              value={config.maxGales}
              onChange={(e) => updateConfig({ maxGales: parseInt(e.target.value) || 0 })}
              className="h-8 text-sm"
              disabled={config.enabled}
            />
          </div>
        </div>

        {/* Progress Bars */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="flex items-center gap-1 text-primary">
                <Target className="h-3 w-3" />
                Progresso da Meta
              </span>
              <span className="text-muted-foreground">
                R$ {Math.max(0, stats.totalProfit).toFixed(2)} / R$ {config.targetProfit.toFixed(2)}
              </span>
            </div>
            <Progress value={profitProgress} className="h-2" />
          </div>
          
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="flex items-center gap-1 text-destructive">
                <Shield className="h-3 w-3" />
                Stop Loss
              </span>
              <span className="text-muted-foreground">
                R$ {Math.abs(Math.min(0, stats.totalProfit)).toFixed(2)} / R$ {config.stopLoss.toFixed(2)}
              </span>
            </div>
            <Progress value={lossProgress} className="h-2 [&>div]:bg-destructive" />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-2">
          <div className="p-2 rounded-lg bg-muted/30 text-center">
            <p className="text-[10px] text-muted-foreground">Apostas</p>
            <p className="text-sm font-bold">{stats.totalBets}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/30 text-center">
            <p className="text-[10px] text-muted-foreground">Wins</p>
            <p className="text-sm font-bold text-primary">{stats.wins}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/30 text-center">
            <p className="text-[10px] text-muted-foreground">Loss</p>
            <p className="text-sm font-bold text-destructive">{stats.losses}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/30 text-center">
            <p className="text-[10px] text-muted-foreground">Win%</p>
            <p className="text-sm font-bold">{winRate}%</p>
          </div>
        </div>

        {/* Profit Display */}
        <div className={`p-3 rounded-lg border ${
          stats.totalProfit >= 0 
            ? 'bg-primary/10 border-primary/30' 
            : 'bg-destructive/10 border-destructive/30'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-sm flex items-center gap-1.5">
              {stats.totalProfit >= 0 ? (
                <TrendingUp className="h-4 w-4 text-primary" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
              Lucro da Sessão
            </span>
            <span className={`text-lg font-bold ${
              stats.totalProfit >= 0 ? 'text-primary' : 'text-destructive'
            }`}>
              {stats.totalProfit >= 0 ? '+' : ''}R$ {stats.totalProfit.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Next Bet Info */}
        {config.enabled && currentPrediction && (
          <div className="p-3 rounded-lg bg-accent/10 border border-accent/30">
            <div className="flex items-center justify-between">
              <span className="text-sm flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-accent" />
                Próxima Aposta
              </span>
              <span className="font-bold text-accent">
                R$ {nextBetAmount.toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Gale {galeLevel}/{config.maxGales} • {currentPrediction.predictedColor === 'red' ? '🔴 Vermelho' : '⚫ Preto'}
            </p>
          </div>
        )}

        {/* Betting Status */}
        {isBetting && (
          <div className="flex items-center justify-center gap-2 p-2 rounded-lg bg-blaze-gold/10 border border-blaze-gold/30">
            <RefreshCw className="h-4 w-4 animate-spin text-blaze-gold" />
            <span className="text-sm text-blaze-gold">Apostando...</span>
          </div>
        )}

        {/* Warning */}
        {!isConnected && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/30">
            <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
            <span className="text-xs text-destructive">
              {connectionError || 'Clique em atualizar saldo para conectar'}
            </span>
          </div>
        )}

        {/* Debug Info - remove after testing */}
        {config.enabled && (
          <div className="p-2 rounded-lg bg-muted/30 border border-border/50 text-xs text-muted-foreground">
            <p>Estado: {predictionState}</p>
            <p>Sinal: {currentPrediction?.predictedColor || 'Nenhum'}</p>
            <p>Gale: {galeLevel}/{config.maxGales}</p>
          </div>
        )}

        {/* Control Buttons */}
        <div className="flex gap-2">
          <Button
            variant={config.enabled ? "destructive" : "default"}
            className="flex-1"
            onClick={toggleAutoBet}
            disabled={isLoading}
          >
            <Power className="h-4 w-4 mr-2" />
            {config.enabled ? 'Parar' : 'Iniciar'} Auto-Bet
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={resetStats}
            disabled={config.enabled}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
