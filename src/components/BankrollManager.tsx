import { useState, useEffect, useCallback } from 'react';
import { Wallet, Target, TrendingUp, AlertTriangle, Calculator, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BankrollManagerProps {
  consecutiveLosses: number;
  onBetCalculated?: (betAmount: number) => void;
}

export function BankrollManager({ consecutiveLosses, onBetCalculated }: BankrollManagerProps) {
  const [bankroll, setBankroll] = useState<number>(0);
  const [target, setTarget] = useState<number>(0);
  const [baseBet, setBaseBet] = useState<number>(0);
  const [currentBet, setCurrentBet] = useState<number>(0);
  const [isConfigured, setIsConfigured] = useState(false);
  const [totalProfit, setTotalProfit] = useState<number>(0);
  const [martingaleLevel, setMartingaleLevel] = useState(0);

  // Calculate Martingale bet
  const calculateMartingaleBet = useCallback((losses: number, base: number): number => {
    if (base <= 0) return 0;
    // Martingale: double the bet after each loss
    return base * Math.pow(2, losses);
  }, []);

  // Update current bet when consecutive losses change
  useEffect(() => {
    if (isConfigured && baseBet > 0) {
      const newBet = calculateMartingaleBet(consecutiveLosses, baseBet);
      setCurrentBet(newBet);
      setMartingaleLevel(consecutiveLosses);
      onBetCalculated?.(newBet);
    }
  }, [consecutiveLosses, baseBet, isConfigured, calculateMartingaleBet, onBetCalculated]);

  const handleConfigure = () => {
    if (bankroll > 0 && target > 0 && baseBet > 0) {
      setIsConfigured(true);
      const initialBet = calculateMartingaleBet(consecutiveLosses, baseBet);
      setCurrentBet(initialBet);
      setMartingaleLevel(consecutiveLosses);
    }
  };

  const handleReset = () => {
    setIsConfigured(false);
    setBankroll(0);
    setTarget(0);
    setBaseBet(0);
    setCurrentBet(0);
    setTotalProfit(0);
    setMartingaleLevel(0);
  };

  // Calculate progress to target
  const progress = target > 0 ? Math.min(((bankroll + totalProfit) / target) * 100, 100) : 0;
  const remaining = target - (bankroll + totalProfit);
  const canCoverBet = (bankroll + totalProfit) >= currentBet;

  // Calculate max consecutive losses bankroll can handle
  const maxMartingaleLevels = baseBet > 0 
    ? Math.floor(Math.log2((bankroll + totalProfit) / baseBet + 1))
    : 0;

  if (!isConfigured) {
    return (
      <div className="glass-card p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-display font-semibold neon-text">
            Gestão de Banca
          </h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Valor da Banca (R$)</label>
            <Input
              type="number"
              placeholder="Ex: 100.00"
              value={bankroll || ''}
              onChange={(e) => setBankroll(parseFloat(e.target.value) || 0)}
              className="bg-muted/50 border-border/50"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Meta a Atingir (R$)</label>
            <Input
              type="number"
              placeholder="Ex: 200.00"
              value={target || ''}
              onChange={(e) => setTarget(parseFloat(e.target.value) || 0)}
              className="bg-muted/50 border-border/50"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Aposta Base (R$)</label>
            <Input
              type="number"
              placeholder="Ex: 5.00"
              value={baseBet || ''}
              onChange={(e) => setBaseBet(parseFloat(e.target.value) || 0)}
              className="bg-muted/50 border-border/50"
            />
          </div>

          <Button 
            onClick={handleConfigure} 
            className="w-full"
            disabled={bankroll <= 0 || target <= 0 || baseBet <= 0}
          >
            <Calculator className="h-4 w-4 mr-2" />
            Configurar Sistema
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-display font-semibold neon-text">
            Gestão de Banca
          </h2>
        </div>
        <Button variant="ghost" size="sm" onClick={handleReset}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Progress to Target */}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">Progresso para Meta</span>
          <span className="font-semibold">{progress.toFixed(1)}%</span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span className="text-muted-foreground">R$ {(bankroll + totalProfit).toFixed(2)}</span>
          <span className="text-primary">R$ {target.toFixed(2)}</span>
        </div>
      </div>

      {/* Current Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-muted/50 text-center">
          <p className="text-xs text-muted-foreground">Banca Atual</p>
          <p className="text-lg font-bold text-foreground">
            R$ {(bankroll + totalProfit).toFixed(2)}
          </p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50 text-center">
          <p className="text-xs text-muted-foreground">Falta para Meta</p>
          <p className={cn(
            "text-lg font-bold",
            remaining <= 0 ? "text-primary" : "text-blaze-gold"
          )}>
            R$ {Math.max(remaining, 0).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Martingale Bet Recommendation */}
      <div className={cn(
        "p-4 rounded-lg mb-4 border",
        martingaleLevel >= 3 ? "bg-accent/10 border-accent/50" : "bg-primary/10 border-primary/50"
      )}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">PRÓXIMA APOSTA</span>
          {martingaleLevel > 0 && (
            <span className={cn(
              "text-xs font-semibold px-2 py-0.5 rounded",
              martingaleLevel >= 3 ? "bg-accent/20 text-accent" : "bg-blaze-gold/20 text-blaze-gold"
            )}>
              Martingale {martingaleLevel}x
            </span>
          )}
        </div>
        <p className={cn(
          "text-3xl font-bold font-display",
          martingaleLevel >= 3 ? "danger-text" : "neon-text"
        )}>
          R$ {currentBet.toFixed(2)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Aposta base: R$ {baseBet.toFixed(2)} • Após {consecutiveLosses} erros
        </p>
      </div>

      {/* Warning if bet exceeds bankroll */}
      {!canCoverBet && (
        <div className="p-3 rounded-lg bg-accent/10 border border-accent/50 mb-4">
          <div className="flex items-center gap-2 text-accent">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-semibold">Banca Insuficiente!</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            A aposta atual excede sua banca disponível.
          </p>
        </div>
      )}

      {/* Martingale Info */}
      <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Sistema Martingale</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Máx. Níveis:</span>
            <span className="ml-1 font-semibold">{maxMartingaleLevels}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Nível Atual:</span>
            <span className={cn(
              "ml-1 font-semibold",
              martingaleLevel >= maxMartingaleLevels - 1 ? "text-accent" : "text-primary"
            )}>
              {martingaleLevel}
            </span>
          </div>
        </div>
        {martingaleLevel >= maxMartingaleLevels - 1 && maxMartingaleLevels > 0 && (
          <p className="text-xs text-accent mt-2">
            ⚠️ Próximo nível pode exceder sua banca
          </p>
        )}
      </div>
    </div>
  );
}
