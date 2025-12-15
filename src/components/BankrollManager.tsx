import { useState, useEffect, useCallback } from 'react';
import { Wallet, Target, TrendingUp, AlertTriangle, Calculator, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PredictionSignal, PredictionState, BlazeRound } from '@/types/blaze';
import { BetNotification } from './BetNotification';

interface BankrollManagerProps {
  predictionState: PredictionState;
  currentPrediction: PredictionSignal | null;
  galeLevel: number;
  lastRound: BlazeRound | null;
  baseBet: number;
  setBaseBet: (value: number) => void;
  totalProfit: number;
  resetProfit: () => void;
}

export function BankrollManager({ 
  predictionState, 
  currentPrediction, 
  galeLevel,
  lastRound,
  baseBet,
  setBaseBet,
  totalProfit,
  resetProfit,
}: BankrollManagerProps) {
  const [bankroll, setBankroll] = useState<number>(() => {
    const saved = localStorage.getItem('blaze-bankroll');
    return saved ? parseFloat(saved) : 0;
  });
  const [target, setTarget] = useState<number>(() => {
    const saved = localStorage.getItem('blaze-target');
    return saved ? parseFloat(saved) : 0;
  });
  const [localBaseBet, setLocalBaseBet] = useState<number>(() => {
    const saved = localStorage.getItem('blaze-base-bet');
    return saved ? parseFloat(saved) : 0;
  });
  const [currentBet, setCurrentBet] = useState<number>(0);
  const [isConfigured, setIsConfigured] = useState(() => {
    return localStorage.getItem('blaze-configured') === 'true';
  });

  // Sync local baseBet with shared state when configured
  useEffect(() => {
    if (isConfigured && localBaseBet > 0 && baseBet !== localBaseBet) {
      setBaseBet(localBaseBet);
    }
  }, [isConfigured, localBaseBet, baseBet, setBaseBet]);

  // Save to localStorage when config changes
  useEffect(() => {
    if (isConfigured) {
      localStorage.setItem('blaze-bankroll', bankroll.toString());
      localStorage.setItem('blaze-target', target.toString());
      localStorage.setItem('blaze-base-bet', localBaseBet.toString());
      localStorage.setItem('blaze-configured', 'true');
    }
  }, [bankroll, target, localBaseBet, isConfigured]);

  const calculateMartingaleBet = useCallback((level: number, base: number): number => {
    if (base <= 0) return 0;
    return base * Math.pow(2, level);
  }, []);

  useEffect(() => {
    if (isConfigured && localBaseBet > 0) {
      const newBet = calculateMartingaleBet(galeLevel, localBaseBet);
      setCurrentBet(newBet);
    }
  }, [galeLevel, localBaseBet, isConfigured, calculateMartingaleBet]);

  const handleConfigure = () => {
    if (bankroll > 0 && target > 0 && localBaseBet > 0) {
      setIsConfigured(true);
      setBaseBet(localBaseBet); // Sync with shared state
      const initialBet = calculateMartingaleBet(0, localBaseBet);
      setCurrentBet(initialBet);
    }
  };

  const handleReset = () => {
    setIsConfigured(false);
    setBankroll(0);
    setTarget(0);
    setLocalBaseBet(0);
    setBaseBet(0);
    setCurrentBet(0);
    resetProfit();
    localStorage.removeItem('blaze-bankroll');
    localStorage.removeItem('blaze-target');
    localStorage.removeItem('blaze-base-bet');
    localStorage.removeItem('blaze-configured');
  };

  // Calculate progress to target
  const currentBalance = bankroll + totalProfit;
  const progress = target > 0 ? Math.min((currentBalance / target) * 100, 100) : 0;
  const remaining = target - currentBalance;
  const canCoverBet = currentBalance >= currentBet;

  // Calculate max consecutive losses bankroll can handle
  const maxMartingaleLevels = localBaseBet > 0 
    ? Math.floor(Math.log2(currentBalance / localBaseBet + 1))
    : 0;

  if (!isConfigured) {
    return (
      <div className="glass-card p-3 sm:p-4 md:p-6">
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          <h2 className="text-base sm:text-lg font-display font-semibold neon-text">
            Gestão de Banca
          </h2>
        </div>

        <div className="space-y-3 sm:space-y-4">
          <div>
            <label className="text-[10px] sm:text-xs text-muted-foreground mb-1 block">Valor da Banca (R$)</label>
            <Input
              type="number"
              placeholder="Ex: 100.00"
              value={bankroll || ''}
              onChange={(e) => setBankroll(parseFloat(e.target.value) || 0)}
              className="bg-muted/50 border-border/50 h-9 sm:h-10 text-sm"
            />
          </div>

          <div>
            <label className="text-[10px] sm:text-xs text-muted-foreground mb-1 block">Meta a Atingir (R$)</label>
            <Input
              type="number"
              placeholder="Ex: 200.00"
              value={target || ''}
              onChange={(e) => setTarget(parseFloat(e.target.value) || 0)}
              className="bg-muted/50 border-border/50 h-9 sm:h-10 text-sm"
            />
          </div>

          <div>
            <label className="text-[10px] sm:text-xs text-muted-foreground mb-1 block">Aposta Base (R$)</label>
            <Input
              type="number"
              placeholder="Ex: 5.00"
              value={localBaseBet || ''}
              onChange={(e) => setLocalBaseBet(parseFloat(e.target.value) || 0)}
              className="bg-muted/50 border-border/50 h-9 sm:h-10 text-sm"
            />
          </div>

          <Button 
            onClick={handleConfigure} 
            className="w-full h-9 sm:h-10 text-sm"
            disabled={bankroll <= 0 || target <= 0 || localBaseBet <= 0}
          >
            <Calculator className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-2" />
            Configurar Sistema
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-3 sm:p-4 md:p-6">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          <h2 className="text-base sm:text-lg font-display font-semibold neon-text">
            Gestão de Banca
          </h2>
        </div>
        <Button variant="ghost" size="sm" onClick={handleReset} className="h-8 w-8 p-0">
          <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </Button>
      </div>

      {/* Bet Notification */}
      <div className="mb-3 sm:mb-4">
        <BetNotification
          currentPrediction={currentPrediction}
          predictionState={predictionState}
          currentBet={currentBet}
          lastRound={lastRound}
          isConfigured={isConfigured}
        />
      </div>

      {/* Profit/Loss Display */}
      <div className={cn(
        "p-2 sm:p-3 rounded-lg mb-3 sm:mb-4 text-center",
        totalProfit >= 0 ? "bg-primary/10 border border-primary/30" : "bg-accent/10 border border-accent/30"
      )}>
        <p className="text-[10px] sm:text-xs text-muted-foreground">Lucro/Prejuízo da Sessão</p>
        <p className={cn(
          "text-lg sm:text-xl font-bold",
          totalProfit >= 0 ? "text-primary" : "text-accent"
        )}>
          {totalProfit >= 0 ? '+' : ''}R$ {totalProfit.toFixed(2)}
        </p>
      </div>

      {/* Progress to Target */}
      <div className="mb-3 sm:mb-4">
        <div className="flex justify-between text-[10px] sm:text-xs mb-1">
          <span className="text-muted-foreground">Progresso para Meta</span>
          <span className="font-semibold">{progress.toFixed(1)}%</span>
        </div>
        <div className="h-2 sm:h-3 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-500"
            style={{ width: `${Math.max(progress, 0)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] sm:text-xs mt-1">
          <span className="text-muted-foreground">R$ {currentBalance.toFixed(2)}</span>
          <span className="text-primary">R$ {target.toFixed(2)}</span>
        </div>
      </div>

      {/* Current Stats */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3 sm:mb-4">
        <div className="p-2 sm:p-3 rounded-lg bg-muted/50 text-center">
          <p className="text-[10px] sm:text-xs text-muted-foreground">Banca Atual</p>
          <p className="text-sm sm:text-lg font-bold text-foreground">
            R$ {currentBalance.toFixed(2)}
          </p>
        </div>
        <div className="p-2 sm:p-3 rounded-lg bg-muted/50 text-center">
          <p className="text-[10px] sm:text-xs text-muted-foreground">Falta para Meta</p>
          <p className={cn(
            "text-sm sm:text-lg font-bold",
            remaining <= 0 ? "text-primary" : "text-blaze-gold"
          )}>
            R$ {Math.max(remaining, 0).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Warning if bet exceeds bankroll */}
      {!canCoverBet && predictionState !== 'analyzing' && (
        <div className="p-2 sm:p-3 rounded-lg bg-accent/10 border border-accent/50 mb-3 sm:mb-4">
          <div className="flex items-center gap-2 text-accent">
            <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm font-semibold">Banca Insuficiente!</span>
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
            Aposta excede banca disponível.
          </p>
        </div>
      )}

      {/* Martingale Info */}
      <div className="p-2 sm:p-3 rounded-lg bg-muted/30 border border-border/30">
        <div className="flex items-center gap-2 mb-1 sm:mb-2">
          <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          <span className="text-[10px] sm:text-xs text-muted-foreground">Sistema Martingale</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[10px] sm:text-xs">
          <div>
            <span className="text-muted-foreground">Base:</span>
            <span className="ml-1 font-semibold">R$ {localBaseBet.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Máx Gales:</span>
            <span className="ml-1 font-semibold">2</span>
          </div>
          <div>
            <span className="text-muted-foreground">Atual:</span>
            <span className={cn(
              "ml-1 font-semibold",
              galeLevel >= 2 ? "text-accent" : galeLevel >= 1 ? "text-blaze-gold" : "text-primary"
            )}>
              {galeLevel === 0 ? 'Normal' : `Gale ${galeLevel}`}
            </span>
          </div>
        </div>
        {galeLevel >= maxMartingaleLevels - 1 && maxMartingaleLevels > 0 && (
          <p className="text-[10px] sm:text-xs text-accent mt-1 sm:mt-2">
            ⚠️ Próximo nível pode exceder banca
          </p>
        )}
      </div>
    </div>
  );
}