import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  Target, 
  TrendingUp, 
  Calendar, 
  DollarSign, 
  CheckCircle2, 
  AlertTriangle,
  Trash2,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Zap,
  Settings2,
  Play,
  Pause,
  Calculator
} from 'lucide-react';
import { useBankrollGoal, type BankrollGoal } from '@/hooks/useBankrollGoal';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BankrollProgressChart } from './BankrollProgressChart';
import { useExtensionBridge } from '@/hooks/useExtensionBridge';

interface BankrollGoalManagerProps {
  currentProfit: number;
  currentBankroll: number;
  onBettingConfigChange?: (config: {
    baseBet: number;
    maxGales: number;
    dailyTarget: number;
    dailyLossLimit: number;
    stopOnTarget: boolean;
    stopOnLoss: boolean;
  }) => void;
}

export function BankrollGoalManager({ currentProfit, currentBankroll, onBettingConfigChange }: BankrollGoalManagerProps) {
  const { 
    goal, 
    dailyProgress, 
    bettingConfig,
    setNewGoal, 
    clearGoal, 
    getTodayProgress, 
    isGoalAchievable,
    updateBettingConfig,
    calculateRecommendedBet,
    calculateMartingaleBet,
    getTotalCycleCost,
  } = useBankrollGoal(currentProfit);
  
  const { isConnected, sendSignalToExtension } = useExtensionBridge();
  
  const [showChart, setShowChart] = useState(false);
  const [showBettingConfig, setShowBettingConfig] = useState(false);
  const [isSettingGoal, setIsSettingGoal] = useState(!goal);
  const [isExpanded, setIsExpanded] = useState(true);
  const [automationEnabled, setAutomationEnabled] = useState(() => {
    return localStorage.getItem('blaze-goal-automation') === 'true';
  });
  
  // Form state
  const [formBankroll, setFormBankroll] = useState(currentBankroll.toString());
  const [formTarget, setFormTarget] = useState('');
  const [formDays, setFormDays] = useState('30');

  // Notify parent of config changes
  useEffect(() => {
    if (goal && onBettingConfigChange) {
      onBettingConfigChange({
        baseBet: bettingConfig.baseBet,
        maxGales: bettingConfig.maxGales,
        dailyTarget: goal.dailyTarget,
        dailyLossLimit: bettingConfig.dailyLossLimit,
        stopOnTarget: bettingConfig.stopOnTarget,
        stopOnLoss: bettingConfig.stopOnLoss,
      });
    }
  }, [goal, bettingConfig, onBettingConfigChange]);

  // Save automation state
  useEffect(() => {
    localStorage.setItem('blaze-goal-automation', automationEnabled.toString());
  }, [automationEnabled]);

  const handleSetGoal = () => {
    const bankroll = parseFloat(formBankroll) || 0;
    const target = parseFloat(formTarget) || 0;
    const days = parseInt(formDays) || 30;

    if (bankroll > 0 && target > bankroll && days > 0) {
      setNewGoal(bankroll, target, days);
      setIsSettingGoal(false);
    }
  };

  const todayProgress = getTodayProgress();
  const todayRemaining = goal ? Math.max(0, goal.dailyTarget - currentProfit) : 0;
  const recommendedBet = goal ? calculateRecommendedBet(goal.dailyTarget, bettingConfig.maxGales) : 2;
  const cycleCost = getTotalCycleCost();

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const formatCurrency = (value: number) => {
    return `R$ ${value.toFixed(2)}`;
  };

  const toggleAutomation = () => {
    setAutomationEnabled(!automationEnabled);
  };

  return (
    <Card className="bg-card/50 backdrop-blur border-primary/20">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-2">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Gerenciador de Meta
              </CardTitle>
              <div className="flex items-center gap-2">
                {goal && (
                  <Badge 
                    variant={goal.isOnTrack ? 'default' : 'destructive'}
                    className="text-[10px]"
                  >
                    {goal.isOnTrack ? 'No Caminho' : 'Atrasado'}
                  </Badge>
                )}
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-3">
            {/* Goal Setting Form */}
            {isSettingGoal || !goal ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Banca Atual</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                      <Input
                        type="number"
                        value={formBankroll}
                        onChange={(e) => setFormBankroll(e.target.value)}
                        className="pl-7 h-8 text-sm"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Meta Final</Label>
                    <div className="relative">
                      <Target className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                      <Input
                        type="number"
                        value={formTarget}
                        onChange={(e) => setFormTarget(e.target.value)}
                        className="pl-7 h-8 text-sm"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Prazo (dias)</Label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input
                      type="number"
                      value={formDays}
                      onChange={(e) => setFormDays(e.target.value)}
                      className="pl-7 h-8 text-sm"
                      placeholder="30"
                    />
                  </div>
                </div>
                
                {/* Preview */}
                {formBankroll && formTarget && formDays && parseFloat(formTarget) > parseFloat(formBankroll) && (
                  <div className="p-2 rounded bg-primary/10 border border-primary/20 text-xs">
                    <p className="text-muted-foreground">
                      Meta diária: <span className="font-bold text-primary">
                        {formatCurrency((parseFloat(formTarget) - parseFloat(formBankroll)) / parseInt(formDays))}
                      </span>
                    </p>
                  </div>
                )}

                <Button 
                  size="sm" 
                  className="w-full"
                  onClick={handleSetGoal}
                  disabled={!formBankroll || !formTarget || !formDays || parseFloat(formTarget) <= parseFloat(formBankroll)}
                >
                  <Target className="h-3 w-3 mr-1" />
                  Definir Meta
                </Button>
              </div>
            ) : (
              <>
                {/* Goal Progress */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Progresso Total</span>
                    <span className="font-bold">{goal.progress.toFixed(1)}%</span>
                  </div>
                  <Progress value={goal.progress} className="h-2" />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{formatCurrency(goal.currentBankroll)}</span>
                    <span>{formatCurrency(goal.targetAmount)}</span>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded bg-muted/30 space-y-0.5">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <TrendingUp className="h-3 w-3" />
                      Meta Diária
                    </div>
                    <p className="text-sm font-bold text-primary">
                      {formatCurrency(goal.dailyTarget)}
                    </p>
                  </div>
                  <div className="p-2 rounded bg-muted/30 space-y-0.5">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      Dias Restantes
                    </div>
                    <p className="text-sm font-bold">
                      {goal.daysRemaining}
                    </p>
                  </div>
                </div>

                {/* Today's Progress */}
                <div className={`p-2 rounded border ${
                  currentProfit >= goal.dailyTarget 
                    ? 'bg-green-500/10 border-green-500/30' 
                    : 'bg-amber-500/10 border-amber-500/30'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">Hoje</span>
                    {currentProfit >= goal.dailyTarget ? (
                      <Badge className="text-[10px] bg-green-600">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                        Meta Batida!
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        Falta: {formatCurrency(todayRemaining)}
                      </Badge>
                    )}
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Lucro atual:</span>
                    <span className={`font-bold ${currentProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatCurrency(currentProfit)}
                    </span>
                  </div>
                  <Progress 
                    value={Math.min(100, (currentProfit / goal.dailyTarget) * 100)} 
                    className="h-1.5 mt-1"
                  />
                </div>

                {/* Projection */}
                {goal.projectedCompletion && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Previsão de conclusão:</span>
                    <span className={goal.isOnTrack ? 'text-green-400' : 'text-amber-400'}>
                      {formatDate(goal.projectedCompletion)}
                    </span>
                  </div>
                )}

                {/* Warning if behind */}
                {!isGoalAchievable() && goal.daysRemaining > 0 && (
                  <div className="flex items-center gap-2 p-2 rounded bg-destructive/10 border border-destructive/30 text-xs">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="text-destructive">
                      Meta pode estar difícil de atingir no prazo
                    </span>
                  </div>
                )}

                {/* Chart Toggle */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setShowChart(!showChart)}
                >
                  <BarChart3 className="h-3 w-3 mr-1" />
                  {showChart ? 'Ocultar Gráfico' : 'Ver Gráfico de Progresso'}
                </Button>

                {showChart && (
                  <BankrollProgressChart 
                    goal={goal} 
                    dailyProgress={dailyProgress}
                    currentProfit={currentProfit}
                  />
                )}

                {/* Betting Configuration Toggle */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setShowBettingConfig(!showBettingConfig)}
                >
                  <Settings2 className="h-3 w-3 mr-1" />
                  {showBettingConfig ? 'Ocultar Config Apostas' : 'Configurar Apostas'}
                </Button>

                {/* Betting Configuration Panel */}
                {showBettingConfig && (
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium flex items-center gap-1">
                        <Zap className="h-3 w-3 text-primary" />
                        Automação
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] ${isConnected ? 'text-green-400' : 'text-muted-foreground'}`}>
                          {isConnected ? 'Extensão Conectada' : 'Extensão Offline'}
                        </span>
                        <Switch
                          checked={automationEnabled}
                          onCheckedChange={toggleAutomation}
                          disabled={!isConnected}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Aposta Base (R$)</Label>
                        <Input
                          type="number"
                          value={bettingConfig.baseBet}
                          onChange={(e) => updateBettingConfig({ baseBet: parseFloat(e.target.value) || 0 })}
                          className="h-7 text-xs"
                          step="0.5"
                        />
                        <p className="text-[9px] text-muted-foreground">
                          Recomendado: {formatCurrency(recommendedBet)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Máx Gales</Label>
                        <Input
                          type="number"
                          value={bettingConfig.maxGales}
                          onChange={(e) => updateBettingConfig({ maxGales: parseInt(e.target.value) || 0 })}
                          className="h-7 text-xs"
                          min="0"
                          max="3"
                        />
                        <p className="text-[9px] text-muted-foreground">
                          Custo ciclo: {formatCurrency(cycleCost)}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px]">Limite Perda Diária (R$)</Label>
                      <Input
                        type="number"
                        value={bettingConfig.dailyLossLimit}
                        onChange={(e) => updateBettingConfig({ dailyLossLimit: parseFloat(e.target.value) || 0 })}
                        className="h-7 text-xs"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px]">Parar ao atingir meta diária</Label>
                        <Switch
                          checked={bettingConfig.stopOnTarget}
                          onCheckedChange={(checked) => updateBettingConfig({ stopOnTarget: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px]">Parar ao atingir limite de perda</Label>
                        <Switch
                          checked={bettingConfig.stopOnLoss}
                          onCheckedChange={(checked) => updateBettingConfig({ stopOnLoss: checked })}
                        />
                      </div>
                    </div>

                    {/* Martingale Preview */}
                    <div className="p-2 rounded bg-background/50 text-[10px] space-y-1">
                      <p className="font-medium flex items-center gap-1">
                        <Calculator className="h-3 w-3" />
                        Progressão Martingale:
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {Array.from({ length: bettingConfig.maxGales + 1 }, (_, i) => (
                          <span key={i} className={`px-1.5 py-0.5 rounded ${i === 0 ? 'bg-primary/20' : 'bg-muted'}`}>
                            {i === 0 ? 'Base' : `G${i}`}: {formatCurrency(calculateMartingaleBet(i))}
                          </span>
                        ))}
                      </div>
                    </div>

                    {automationEnabled && (
                      <div className="p-2 rounded bg-green-500/10 border border-green-500/30 text-xs">
                        <div className="flex items-center gap-1 text-green-400">
                          <Play className="h-3 w-3" />
                          <span className="font-medium">Automação Ativa</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Extensão executará apostas automaticamente baseado nas previsões da IA.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 text-xs"
                    onClick={() => setIsSettingGoal(true)}
                  >
                    Editar Meta
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={clearGoal}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
