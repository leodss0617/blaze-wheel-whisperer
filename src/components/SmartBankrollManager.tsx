import React, { useState, useEffect, useRef } from 'react';
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
  Clock,
  BarChart3,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Lightbulb
} from 'lucide-react';
import { useBankrollSystem, type MartingaleBet } from '@/hooks/useBankrollSystem';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface SmartBankrollManagerProps {
  galeLevel: number;
  predictionConfidence?: number;
  onBetAmountChange?: (amount: number) => void;
  currentSignal?: {
    color: string;
    status: string;
    confidence: number;
  } | null;
}

export function SmartBankrollManager({ 
  galeLevel, 
  predictionConfidence = 0,
  onBetAmountChange,
  currentSignal
}: SmartBankrollManagerProps) {
  const {
    config,
    isConfigured,
    currentBankroll,
    sessionStats,
    learningInsights,
    calculateMartingale,
    calculateOptimalBaseBet,
    getCurrentBetAmount,
    canCoverBet,
    getRecommendation,
    initializeSession,
    resetSession,
    isLoading,
  } = useBankrollSystem();

  // Track previous bankroll to show changes
  const [lastBankrollChange, setLastBankrollChange] = useState<number>(0);
  const prevBankrollRef = React.useRef<number>(currentBankroll);

  const [formBankroll, setFormBankroll] = useState('');
  const [formTarget, setFormTarget] = useState('');
  const [formBaseBet, setFormBaseBet] = useState('');
  const [showMartingale, setShowMartingale] = useState(true);
  const [showInsights, setShowInsights] = useState(false);
  const [martingaleProgression, setMartingaleProgression] = useState<MartingaleBet[]>([]);

  // Calculate optimal bet when bankroll and target change
  useEffect(() => {
    const bankroll = parseFloat(formBankroll) || 0;
    const target = parseFloat(formTarget) || 0;
    
    if (bankroll > 0 && target > bankroll) {
      const optimal = calculateOptimalBaseBet(bankroll, target);
      setFormBaseBet(optimal.toFixed(2));
    }
  }, [formBankroll, formTarget, calculateOptimalBaseBet]);

  // Update martingale progression when config changes
  useEffect(() => {
    if (config) {
      const progression = calculateMartingale(config.baseBet, config.maxGales);
      setMartingaleProgression(progression);
    }
  }, [config, calculateMartingale]);

  // Notify parent of bet amount changes
  useEffect(() => {
    if (config && onBetAmountChange) {
      const currentBet = getCurrentBetAmount(galeLevel);
      onBetAmountChange(currentBet);
    }
  }, [config, galeLevel, getCurrentBetAmount, onBetAmountChange]);

  // Track bankroll changes for visual feedback
  useEffect(() => {
    if (currentBankroll !== prevBankrollRef.current) {
      const change = currentBankroll - prevBankrollRef.current;
      if (prevBankrollRef.current > 0) {
        setLastBankrollChange(change);
        // Clear the change indicator after 3 seconds
        const timer = setTimeout(() => setLastBankrollChange(0), 3000);
        return () => clearTimeout(timer);
      }
      prevBankrollRef.current = currentBankroll;
    }
  }, [currentBankroll]);

  const handleInitialize = async () => {
    const bankroll = parseFloat(formBankroll) || 0;
    const target = parseFloat(formTarget) || 0;
    const baseBet = parseFloat(formBaseBet) || 0;
    
    if (bankroll > 0 && target > bankroll && baseBet > 0) {
      await initializeSession(bankroll, target, baseBet, 2);
    }
  };

  const formatCurrency = (value: number) => `R$ ${value.toFixed(2)}`;
  
  const recommendation = isConfigured ? getRecommendation() : null;
  const currentBet = isConfigured ? getCurrentBetAmount(galeLevel) : 0;
  const canAffordBet = isConfigured ? canCoverBet(galeLevel) : false;

  // Configuration form
  if (!isConfigured) {
    return (
      <Card className="bg-card/50 backdrop-blur border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
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
              <Label className="text-xs">Meta (R$)</Label>
              <Input
                type="number"
                value={formTarget}
                onChange={(e) => setFormTarget(e.target.value)}
                placeholder="200.00"
                className="h-9 text-sm"
              />
            </div>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Aposta Base (R$)</Label>
              {formBankroll && formTarget && parseFloat(formTarget) > parseFloat(formBankroll) && (
                <Badge variant="outline" className="text-[10px]">
                  <Lightbulb className="h-2.5 w-2.5 mr-1" />
                  Recomendado
                </Badge>
              )}
            </div>
            <Input
              type="number"
              value={formBaseBet}
              onChange={(e) => setFormBaseBet(e.target.value)}
              placeholder="5.00"
              className="h-9 text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              Valor calculado para atingir a meta de forma segura
            </p>
          </div>

          {formBankroll && formTarget && formBaseBet && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 space-y-2">
              <p className="text-xs font-medium">Prévia Martingale:</p>
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
                Ciclo completo: {formatCurrency((parseFloat(formBaseBet) || 0) * 7)}
              </p>
            </div>
          )}

          <Button 
            onClick={handleInitialize}
            className="w-full"
            disabled={!formBankroll || !formTarget || !formBaseBet || 
              parseFloat(formTarget) <= parseFloat(formBankroll)}
          >
            <Calculator className="h-4 w-4 mr-2" />
            Iniciar Gestão Inteligente
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Main dashboard
  return (
    <Card className="bg-card/50 backdrop-blur border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Gestão Inteligente
          </CardTitle>
          <div className="flex items-center gap-2">
            {sessionStats.progressToTarget >= 100 && (
              <Badge className="bg-green-600 text-[10px]">
                <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                META!
              </Badge>
            )}
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
            <span className="font-bold">{Math.min(100, sessionStats.progressToTarget).toFixed(1)}%</span>
          </div>
          <Progress value={Math.min(100, sessionStats.progressToTarget)} className="h-2" />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{formatCurrency(config!.initialBankroll)}</span>
            <span className="font-bold text-primary">{formatCurrency(currentBankroll)}</span>
            <span>{formatCurrency(config!.targetAmount)}</span>
          </div>
        </div>

        {/* Live Bankroll Change Indicator */}
        {lastBankrollChange !== 0 && (
          <div className={cn(
            "p-2 rounded-lg text-center animate-pulse",
            lastBankrollChange > 0 ? "bg-green-500/20 border border-green-500/40" : "bg-red-500/20 border border-red-500/40"
          )}>
            <p className={cn(
              "text-lg font-bold",
              lastBankrollChange > 0 ? "text-green-400" : "text-red-400"
            )}>
              {lastBankrollChange > 0 ? '+' : ''}{formatCurrency(lastBankrollChange)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {lastBankrollChange > 0 ? 'Lucro na última aposta' : 'Perda na última aposta'}
            </p>
          </div>
        )}

        {/* Current Signal Status */}
        {currentSignal && (
          <div className={cn(
            "p-2 rounded-lg flex items-center justify-between",
            currentSignal.status === 'pending' ? "bg-amber-500/10 border border-amber-500/30" :
            currentSignal.status === 'won' ? "bg-green-500/10 border border-green-500/30" :
            "bg-red-500/10 border border-red-500/30"
          )}>
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-3 h-3 rounded-full",
                currentSignal.color === 'red' ? "bg-red-500" : "bg-gray-800 border border-gray-500"
              )} />
              <span className="text-xs font-medium">
                {currentSignal.status === 'pending' ? 'Aguardando resultado...' :
                 currentSignal.status === 'won' ? '✅ Aposta ganha!' : '❌ Aposta perdida'}
              </span>
            </div>
            <Badge variant={currentSignal.status === 'pending' ? 'secondary' : currentSignal.status === 'won' ? 'default' : 'destructive'} className="text-[10px]">
              {currentSignal.confidence}%
            </Badge>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded-lg bg-muted/30 text-center">
            <p className="text-[10px] text-muted-foreground">Banca</p>
            <p className={cn(
              "text-sm font-bold",
              currentBankroll >= config!.initialBankroll ? "text-green-400" : "text-red-400"
            )}>
              {formatCurrency(currentBankroll)}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-muted/30 text-center">
            <p className="text-[10px] text-muted-foreground">Lucro</p>
            <p className={cn(
              "text-sm font-bold",
              sessionStats.totalProfit >= 0 ? "text-green-400" : "text-red-400"
            )}>
              {sessionStats.totalProfit >= 0 ? '+' : ''}{formatCurrency(sessionStats.totalProfit)}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-muted/30 text-center">
            <p className="text-[10px] text-muted-foreground">Win Rate</p>
            <p className="text-sm font-bold text-primary">
              {sessionStats.winRate.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Current Bet Display */}
        <div className={cn(
          "p-3 rounded-lg border",
          galeLevel === 0 
            ? "bg-primary/10 border-primary/30" 
            : galeLevel === 1 
              ? "bg-amber-500/10 border-amber-500/30"
              : "bg-red-500/10 border-red-500/30"
        )}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium">
              {galeLevel === 0 ? 'Aposta Base' : `Gale ${galeLevel}`}
            </span>
            {!canAffordBet && (
              <Badge variant="destructive" className="text-[10px]">
                <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                Banca insuficiente
              </Badge>
            )}
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className={cn(
                "text-2xl font-bold",
                galeLevel === 0 ? "text-primary" : galeLevel === 1 ? "text-amber-400" : "text-red-400"
              )}>
                {formatCurrency(currentBet)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Potencial: +{formatCurrency(currentBet)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Após esta aposta</p>
              <p className="text-sm font-medium">
                {formatCurrency(currentBankroll - currentBet)}
              </p>
            </div>
          </div>
        </div>

        {/* Recommendation */}
        {recommendation && (
          <div className={cn(
            "p-2 rounded-lg text-xs flex items-center gap-2",
            recommendation.shouldBet 
              ? "bg-green-500/10 border border-green-500/30" 
              : "bg-amber-500/10 border border-amber-500/30"
          )}>
            {recommendation.shouldBet ? (
              <Zap className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            )}
            <span>{recommendation.reason}</span>
            {recommendation.adjustedConfidence !== 0 && (
              <Badge variant="outline" className="ml-auto text-[10px]">
                {recommendation.adjustedConfidence > 0 ? '+' : ''}{recommendation.adjustedConfidence}%
              </Badge>
            )}
          </div>
        )}

        <Separator className="bg-border/30" />

        {/* Martingale Progression */}
        <Collapsible open={showMartingale} onOpenChange={setShowMartingale}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between h-8">
              <span className="text-xs flex items-center gap-1">
                <Calculator className="h-3 w-3" />
                Progressão Martingale
              </span>
              {showMartingale ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="space-y-2">
              {martingaleProgression.map((bet, i) => (
                <div 
                  key={i}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-lg text-xs",
                    i === galeLevel 
                      ? "bg-primary/20 border border-primary/40" 
                      : "bg-muted/20"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={i === 0 ? "default" : "secondary"}
                      className={cn(
                        "text-[10px]",
                        i === galeLevel && "animate-pulse"
                      )}
                    >
                      {i === 0 ? 'BASE' : `G${i}`}
                    </Badge>
                    <span className="font-medium">{formatCurrency(bet.amount)}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground">
                      Investido: {formatCurrency(bet.totalInvested)}
                    </p>
                    <p className={cn(
                      "font-medium",
                      bet.potentialProfit > 0 ? "text-green-400" : "text-red-400"
                    )}>
                      {bet.potentialProfit >= 0 ? '+' : ''}{formatCurrency(bet.potentialProfit)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Learning Insights */}
        <Collapsible open={showInsights} onOpenChange={setShowInsights}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between h-8">
              <span className="text-xs flex items-center gap-1">
                <Brain className="h-3 w-3" />
                Insights de Aprendizado
              </span>
              {showInsights ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-3">
            {isLoading ? (
              <p className="text-xs text-muted-foreground text-center">Carregando insights...</p>
            ) : (
              <>
                {/* Best/Worst Hours */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-[10px] text-green-400 flex items-center gap-1 mb-1">
                      <Clock className="h-2.5 w-2.5" />
                      Melhores Horários
                    </p>
                    <p className="text-xs font-medium">
                      {learningInsights.bestHours.length > 0 
                        ? learningInsights.bestHours.map(h => `${h}h`).join(', ')
                        : 'Coletando dados...'}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-[10px] text-red-400 flex items-center gap-1 mb-1">
                      <Clock className="h-2.5 w-2.5" />
                      Evitar Horários
                    </p>
                    <p className="text-xs font-medium">
                      {learningInsights.worstHours.length > 0 
                        ? learningInsights.worstHours.map(h => `${h}h`).join(', ')
                        : 'Coletando dados...'}
                    </p>
                  </div>
                </div>

                {/* Gale Performance */}
                <div className="p-2 rounded-lg bg-muted/30">
                  <p className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1">
                    <BarChart3 className="h-2.5 w-2.5" />
                    Performance por Gale
                  </p>
                  <div className="flex gap-2">
                    {Object.entries(learningInsights.galeSuccess).map(([level, stats]) => (
                      <div key={level} className="flex-1 text-center">
                        <Badge variant="outline" className="text-[10px] mb-1">
                          {level === '0' ? 'Base' : `G${level}`}
                        </Badge>
                        <p className={cn(
                          "text-xs font-bold",
                          stats.rate >= 50 ? "text-green-400" : "text-red-400"
                        )}>
                          {stats.rate.toFixed(0)}%
                        </p>
                        <p className="text-[9px] text-muted-foreground">
                          {stats.wins}/{stats.total}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Streak Info */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-xs">
                  <div className="flex items-center gap-2">
                    {learningInsights.streakAnalysis.isWinning ? (
                      <TrendingUp className="h-4 w-4 text-green-400" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-400" />
                    )}
                    <span>Sequência atual: {learningInsights.streakAnalysis.currentStreak}</span>
                  </div>
                  <div className="text-right text-[10px] text-muted-foreground">
                    <p>Máx Win: {learningInsights.streakAnalysis.maxWinStreak}</p>
                    <p>Máx Loss: {learningInsights.streakAnalysis.maxLossStreak}</p>
                  </div>
                </div>

                {/* Stats Summary */}
                <div className="text-[10px] text-muted-foreground text-center">
                  <p>
                    Total de apostas: {sessionStats.totalBets} | 
                    Vitórias: {sessionStats.wins} | 
                    Derrotas: {sessionStats.losses}
                  </p>
                </div>
              </>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
