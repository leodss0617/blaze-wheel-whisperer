import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Wallet, 
  Target, 
  TrendingUp, 
  TrendingDown,
  Calculator,
  RefreshCw,
  Brain,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Zap,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Lightbulb,
  Activity
} from 'lucide-react';
import { useAdvancedBankroll, type GaleProgression } from '@/hooks/useAdvancedBankroll';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AdvancedBankrollManagerProps {
  galeLevel: number;
  predictionConfidence?: number;
  onBetAmountChange?: (amount: number) => void;
  onBetCalculation?: (calc: ReturnType<typeof useAdvancedBankroll>['calculateBet'] extends (...args: any) => infer R ? R : never) => void;
}

export function AdvancedBankrollManager({ 
  galeLevel, 
  predictionConfidence = 0,
  onBetAmountChange,
  onBetCalculation 
}: AdvancedBankrollManagerProps) {
  const {
    config,
    isConfigured,
    stats,
    isLoading,
    calculateOptimalBaseBet,
    calculateGaleProgression,
    calculateBet,
    initializeSession,
    resetSession,
  } = useAdvancedBankroll();

  const [formBankroll, setFormBankroll] = useState('');
  const [formTarget, setFormTarget] = useState('');
  const [formBaseBet, setFormBaseBet] = useState('');
  const [riskLevel, setRiskLevel] = useState<'conservative' | 'moderate' | 'aggressive'>('moderate');
  const [stopLoss, setStopLoss] = useState('30');
  const [showDetails, setShowDetails] = useState(true);
  const [galeProgression, setGaleProgression] = useState<GaleProgression[]>([]);

  // Calculate optimal bet when inputs change
  useEffect(() => {
    const bankroll = parseFloat(formBankroll) || 0;
    const target = parseFloat(formTarget) || 0;
    
    if (bankroll > 0 && target > 0) {
      const optimal = calculateOptimalBaseBet(bankroll, target, riskLevel, 2);
      setFormBaseBet(optimal.toFixed(2));
    }
  }, [formBankroll, formTarget, riskLevel, calculateOptimalBaseBet]);

  // Update gale progression when config changes
  useEffect(() => {
    if (config) {
      const progression = calculateGaleProgression(config.baseBet, config.maxGales, stats.currentBankroll || config.currentBankroll);
      setGaleProgression(progression);
    }
  }, [config, stats.currentBankroll, calculateGaleProgression]);

  // Notify parent of bet changes
  useEffect(() => {
    if (config) {
      const betCalc = calculateBet(galeLevel, predictionConfidence);
      onBetAmountChange?.(betCalc.suggestedBet);
      onBetCalculation?.(betCalc);
    }
  }, [config, galeLevel, predictionConfidence, calculateBet, onBetAmountChange, onBetCalculation]);

  const handleInitialize = async () => {
    const bankroll = parseFloat(formBankroll) || 0;
    const target = parseFloat(formTarget) || 0;
    const stop = parseFloat(stopLoss) || 30;
    
    if (bankroll > 0 && target > 0) {
      await initializeSession(bankroll, target, riskLevel, 2, stop);
    }
  };

  const formatCurrency = (value: number) => `R$ ${value.toFixed(2)}`;

  // Configuration form
  if (!isConfigured) {
    return (
      <Card className="bg-card/50 backdrop-blur border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Gestão de Banca Inteligente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Banca Inicial (R$)</Label>
              <Input
                type="number"
                value={formBankroll}
                onChange={(e) => setFormBankroll(e.target.value)}
                placeholder="100.00"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Meta de Lucro (R$)</Label>
              <Input
                type="number"
                value={formTarget}
                onChange={(e) => setFormTarget(e.target.value)}
                placeholder="50.00"
                className="h-9 text-sm"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nível de Risco</Label>
              <Select value={riskLevel} onValueChange={(v) => setRiskLevel(v as any)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conservative">Conservador (2%)</SelectItem>
                  <SelectItem value="moderate">Moderado (5%)</SelectItem>
                  <SelectItem value="aggressive">Agressivo (10%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Stop Loss (%)</Label>
              <Input
                type="number"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="30"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Aposta Base Calculada (R$)</Label>
              <Badge variant="outline" className="text-[10px]">
                <Lightbulb className="h-2.5 w-2.5 mr-1" />
                Otimizada
              </Badge>
            </div>
            <Input
              type="number"
              value={formBaseBet}
              onChange={(e) => setFormBaseBet(e.target.value)}
              placeholder="5.00"
              className="h-9 text-sm bg-primary/10 border-primary/30"
              readOnly
            />
            <p className="text-[10px] text-muted-foreground">
              Calculada para maximizar lucro com risco controlado
            </p>
          </div>

          {formBankroll && formTarget && formBaseBet && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 space-y-2">
              <p className="text-xs font-medium flex items-center gap-2">
                <Shield className="h-3 w-3" />
                Prévia de Proteção:
              </p>
              <div className="flex gap-2 flex-wrap">
                {[0, 1, 2].map(level => {
                  const bet = (parseFloat(formBaseBet) || 0) * Math.pow(2, level);
                  return (
                    <Badge 
                      key={level} 
                      variant={level === 0 ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {level === 0 ? 'Base' : `G${level}`}: {formatCurrency(bet)}
                    </Badge>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Ciclo completo: {formatCurrency((parseFloat(formBaseBet) || 0) * 7)} | 
                Stop Loss: {formatCurrency((parseFloat(formBankroll) || 0) * (parseFloat(stopLoss) || 30) / 100)}
              </p>
            </div>
          )}

          <Button 
            onClick={handleInitialize}
            className="w-full"
            disabled={!formBankroll || !formTarget || !formBaseBet}
          >
            <Calculator className="h-4 w-4 mr-2" />
            Iniciar Gestão Inteligente
          </Button>
        </CardContent>
      </Card>
    );
  }

  const betCalc = calculateBet(galeLevel, predictionConfidence);
  const progressColor = stats.progressToTarget >= 100 
    ? 'bg-green-500' 
    : stats.progressToTarget >= 50 
      ? 'bg-primary' 
      : 'bg-yellow-500';

  // Main dashboard
  return (
    <Card className="bg-card/50 backdrop-blur border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Gestão Inteligente
            {stats.progressToTarget >= 100 && (
              <Badge className="bg-green-600 text-[10px]">
                <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                META!
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={
              config.riskLevel === 'conservative' ? 'secondary' :
              config.riskLevel === 'moderate' ? 'default' : 'destructive'
            } className="text-[9px]">
              {config.riskLevel === 'conservative' ? '🛡️' :
               config.riskLevel === 'moderate' ? '⚖️' : '🔥'}
            </Badge>
            <Button variant="ghost" size="sm" onClick={resetSession} className="h-7 w-7 p-0">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* Progress to Target */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Progresso para Meta</span>
            <span className="font-bold">{Math.min(100, Math.max(0, stats.progressToTarget)).toFixed(1)}%</span>
          </div>
          <Progress value={Math.min(100, Math.max(0, stats.progressToTarget))} className={cn("h-2", progressColor)} />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{formatCurrency(config.initialBankroll)}</span>
            <span className="font-bold text-primary">{formatCurrency(stats.currentBankroll)}</span>
            <span>{formatCurrency(config.targetAmount)}</span>
          </div>
        </div>

        {/* Current Bet Calculation */}
        <div className={cn(
          "p-3 rounded-lg border",
          betCalc.recommendation === 'bet' ? "bg-green-500/10 border-green-500/30" :
          betCalc.recommendation === 'skip' ? "bg-yellow-500/10 border-yellow-500/30" :
          "bg-red-500/10 border-red-500/30"
        )}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium">Próxima Aposta</span>
            <Badge variant={
              betCalc.recommendation === 'bet' ? 'default' :
              betCalc.recommendation === 'skip' ? 'secondary' : 'destructive'
            } className="text-[10px]">
              {betCalc.recommendation === 'bet' ? <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> :
               betCalc.recommendation === 'skip' ? <AlertTriangle className="h-2.5 w-2.5 mr-1" /> :
               <AlertTriangle className="h-2.5 w-2.5 mr-1" />}
              {betCalc.recommendation.toUpperCase()}
            </Badge>
          </div>
          
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-bold">{formatCurrency(betCalc.suggestedBet)}</span>
            {galeLevel > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                GALE {galeLevel}
              </Badge>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground mb-2">{betCalc.reason}</p>

          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div className="text-center">
              <p className="text-muted-foreground">Risco</p>
              <p className={cn("font-bold", betCalc.riskPercentage > 30 ? "text-red-400" : "text-green-400")}>
                {betCalc.riskPercentage.toFixed(1)}%
              </p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground">Segurança</p>
              <p className={cn("font-bold", betCalc.safetyScore >= 60 ? "text-green-400" : "text-yellow-400")}>
                {betCalc.safetyScore.toFixed(0)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground">Lucro Pot.</p>
              <p className="font-bold text-primary">{formatCurrency(betCalc.potentialProfit)}</p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-2">
          <div className="p-2 rounded-lg bg-muted/30 text-center">
            <p className="text-[9px] text-muted-foreground">Banca</p>
            <p className={cn(
              "text-sm font-bold",
              stats.totalProfit >= 0 ? "text-green-400" : "text-red-400"
            )}>
              {formatCurrency(stats.currentBankroll)}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-muted/30 text-center">
            <p className="text-[9px] text-muted-foreground">Lucro</p>
            <p className={cn(
              "text-sm font-bold",
              stats.totalProfit >= 0 ? "text-green-400" : "text-red-400"
            )}>
              {stats.totalProfit >= 0 ? '+' : ''}{formatCurrency(stats.totalProfit)}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-muted/30 text-center">
            <p className="text-[9px] text-muted-foreground">Win Rate</p>
            <p className="text-sm font-bold">{stats.winRate.toFixed(1)}%</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/30 text-center">
            <p className="text-[9px] text-muted-foreground">Apostas</p>
            <p className="text-sm font-bold">{stats.wins}/{stats.totalBets}</p>
          </div>
        </div>

        {/* Collapsible Details */}
        <Collapsible open={showDetails} onOpenChange={setShowDetails}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full h-7 text-xs">
              {showDetails ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
              {showDetails ? 'Menos Detalhes' : 'Mais Detalhes'}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-2">
            {/* Gale Progression */}
            <div className="space-y-2">
              <p className="text-xs font-medium flex items-center gap-2">
                <Activity className="h-3 w-3" />
                Progressão Martingale
              </p>
              <div className="flex gap-2 flex-wrap">
                {galeProgression.map((g, idx) => (
                  <div 
                    key={idx}
                    className={cn(
                      "p-2 rounded-lg text-center flex-1 min-w-[70px]",
                      idx === galeLevel ? "bg-primary/20 border border-primary" : "bg-muted/30"
                    )}
                  >
                    <p className="text-[9px] text-muted-foreground">
                      {idx === 0 ? 'Base' : `Gale ${idx}`}
                    </p>
                    <p className="text-xs font-bold">{formatCurrency(g.betAmount)}</p>
                    <p className={cn(
                      "text-[9px]",
                      g.riskPercentage > 30 ? "text-red-400" : "text-muted-foreground"
                    )}>
                      {g.riskPercentage.toFixed(1)}% risco
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Metrics */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-lg bg-muted/30">
                <p className="text-[9px] text-muted-foreground flex items-center gap-1">
                  <TrendingDown className="h-2.5 w-2.5" />
                  Max Drawdown
                </p>
                <p className={cn(
                  "text-sm font-bold",
                  stats.maxDrawdown > 20 ? "text-red-400" : "text-muted-foreground"
                )}>
                  {stats.maxDrawdown.toFixed(1)}%
                </p>
              </div>
              <div className="p-2 rounded-lg bg-muted/30">
                <p className="text-[9px] text-muted-foreground flex items-center gap-1">
                  <BarChart3 className="h-2.5 w-2.5" />
                  Est. p/ Meta
                </p>
                <p className="text-sm font-bold">{stats.estimatedBetsToTarget} apostas</p>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
