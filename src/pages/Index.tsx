import { useBlazeData } from '@/hooks/useBlazeData';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { LiveWheel } from '@/components/LiveWheel';
import { HistoryPanel } from '@/components/HistoryPanel';
import { StatsPanel } from '@/components/StatsPanel';
import { SignalPanel } from '@/components/SignalPanel';
import { PatternChart } from '@/components/PatternChart';
import { AIPanel } from '@/components/AIPanel';
import { CountdownTimer } from '@/components/CountdownTimer';
import { BankrollManager } from '@/components/BankrollManager';
import { BrasiliaClockDisplay } from '@/components/BrasiliaClockDisplay';
import { BetHistoryPanel } from '@/components/BetHistoryPanel';
import { AutoBetPanel } from '@/components/AutoBetPanel';
import { SettingsPanel } from '@/components/SettingsPanel';
import { ExtensionPanel } from '@/components/ExtensionPanel';
import { Flame, Brain, Activity, BarChart3, Wallet, Target, Download, Bot, Settings } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const Index = () => {
  const {
    rounds,
    stats,
    signals,
    connectionStatus,
    isSimulating,
    connectToBlaze,
    disconnect,
    startSimulation,
    stopSimulation,
    useAI,
    setUseAI,
    isAILoading,
    aiPrediction,
    aiStats,
    consecutiveLosses,
    isRecalibrating,
    predictionState,
    currentPrediction,
    galeLevel,
    predictionInterval,
    setPredictionInterval,
    roundsUntilNextPrediction,
    baseBet,
    setBaseBet,
    totalProfit,
    resetProfit,
  } = useBlazeData();

  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if app is installed
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches;
    setShowInstallPrompt(!isInstalled);
  }, []);

  const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;

  const wins = signals.filter(s => s.status === 'win').length;
  const losses = signals.filter(s => s.status === 'loss').length;
  const total = wins + losses;
  const winRate = total > 0 ? (wins / total) * 100 : 0;

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden">
      {/* Scan line effect - hidden on mobile for performance */}
      <div className="scan-line fixed inset-0 pointer-events-none z-50 hidden md:block" />
      
      {/* Background grid */}
      <div 
        className="fixed inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(hsl(var(--primary) / 0.1) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--primary) / 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-border/50 bg-card/80 backdrop-blur-xl sticky top-0 z-40">
          <div className="container mx-auto px-3 sm:px-4 py-3 max-w-7xl">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 rounded-lg bg-accent/20 neon-border">
                  <Flame className="h-5 w-5 sm:h-6 sm:w-6 text-accent" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl md:text-2xl font-display font-bold tracking-tight">
                    <span className="danger-text">BLAZE</span>
                    <span className="text-foreground"> PRO</span>
                  </h1>
                  <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">
                    Sistema Inteligente de Análise
                  </p>
                </div>
              </div>

              {/* Status Badges - Desktop */}
              <div className="hidden sm:flex items-center gap-2">
                <BrasiliaClockDisplay />
                {showInstallPrompt && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-xs border-primary/30 hover:bg-primary/10"
                    onClick={() => navigate('/install')}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Instalar
                  </Button>
                )}
                {useAI && (
                  <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-primary/10 border border-primary/30">
                    <Brain className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary" />
                    <span className="text-[10px] sm:text-xs font-semibold text-primary">IA ATIVA</span>
                  </div>
                )}
                <div className={`flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full ${
                  connectionStatus === 'connected' 
                    ? 'bg-primary/10 border border-primary/30' 
                    : 'bg-muted border border-border'
                }`}>
                  <div className={`h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full ${
                    connectionStatus === 'connected' ? 'bg-primary animate-pulse' : 'bg-muted-foreground'
                  }`} />
                  <span className={`text-[10px] sm:text-xs font-medium ${
                    connectionStatus === 'connected' ? 'text-primary' : 'text-muted-foreground'
                  }`}>
                    {connectionStatus === 'connected' ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
              </div>

              {/* Mobile Status & Menu */}
              <div className="flex sm:hidden items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-primary animate-pulse' : 'bg-muted-foreground'
                }`} />
                {useAI && <Brain className="h-4 w-4 text-primary" />}
                {showInstallPrompt && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0"
                    onClick={() => navigate('/install')}
                  >
                    <Download className="h-4 w-4 text-primary" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Quick Stats Bar */}
        <div className="border-b border-border/30 bg-card/30 backdrop-blur-sm">
          <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-3 max-w-7xl">
            <div className="grid grid-cols-4 gap-2 sm:gap-4">
              <div className="flex items-center gap-1.5 sm:gap-3 p-1.5 sm:p-2 rounded-lg bg-muted/30">
                <Activity className="h-3 w-3 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[8px] sm:text-xs text-muted-foreground truncate">Rodadas</p>
                  <p className="text-xs sm:text-sm font-bold">{rounds.length}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-3 p-1.5 sm:p-2 rounded-lg bg-muted/30">
                <Target className="h-3 w-3 sm:h-4 sm:w-4 text-blaze-gold flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[8px] sm:text-xs text-muted-foreground truncate">Sinais</p>
                  <p className="text-xs sm:text-sm font-bold">{signals.length}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-3 p-1.5 sm:p-2 rounded-lg bg-muted/30">
                <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[8px] sm:text-xs text-muted-foreground truncate">Win</p>
                  <p className="text-xs sm:text-sm font-bold text-primary">{winRate.toFixed(0)}%</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-3 p-1.5 sm:p-2 rounded-lg bg-muted/30">
                <Wallet className="h-3 w-3 sm:h-4 sm:w-4 text-accent flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[8px] sm:text-xs text-muted-foreground truncate">W/L</p>
                  <p className="text-xs sm:text-sm font-bold">
                    <span className="text-primary">{wins}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-accent">{losses}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-7xl">
          {/* Connection Panel */}
          <div className="mb-4 sm:mb-6">
            <ConnectionPanel
              status={connectionStatus}
              isSimulating={isSimulating}
              onConnect={connectToBlaze}
              onDisconnect={disconnect}
              onStartSimulation={startSimulation}
              onStopSimulation={stopSimulation}
            />
          </div>

          {/* Mobile Layout with Tabs */}
          <div className="lg:hidden">
            <Tabs defaultValue="live" className="w-full">
              <TabsList className="w-full grid grid-cols-7 mb-4 bg-card/50">
                <TabsTrigger value="live" className="text-[10px] px-0.5">Live</TabsTrigger>
                <TabsTrigger value="signals" className="text-[10px] px-0.5">Sinais</TabsTrigger>
                <TabsTrigger value="history" className="text-[10px] px-0.5">Apostas</TabsTrigger>
                <TabsTrigger value="ai" className="text-[10px] px-0.5">IA</TabsTrigger>
                <TabsTrigger value="bank" className="text-[10px] px-0.5">Banca</TabsTrigger>
                <TabsTrigger value="auto" className="text-[10px] px-0.5">Auto</TabsTrigger>
                <TabsTrigger value="settings" className="text-[10px] px-0.5">Config</TabsTrigger>
              </TabsList>

              <TabsContent value="live" className="space-y-4 mt-0">
                <CountdownTimer lastRoundTimestamp={lastRound?.timestamp || null} />
                <LiveWheel lastRound={lastRound} />
                <HistoryPanel rounds={rounds} />
                <PatternChart rounds={rounds} />
              </TabsContent>

              <TabsContent value="signals" className="space-y-4 mt-0">
                <SignalPanel 
                  signals={signals} 
                  predictionState={predictionState}
                  currentPrediction={currentPrediction}
                  roundsUntilNextPrediction={roundsUntilNextPrediction}
                />
                <StatsPanel stats={stats} />
              </TabsContent>

              <TabsContent value="history" className="space-y-4 mt-0">
                <BetHistoryPanel signals={signals} />
              </TabsContent>

              <TabsContent value="ai" className="space-y-4 mt-0">
                <AIPanel
                  prediction={aiPrediction}
                  stats={aiStats}
                  isLoading={isAILoading}
                  useAI={useAI}
                  onToggleAI={setUseAI}
                  consecutiveLosses={consecutiveLosses}
                  isRecalibrating={isRecalibrating}
                  predictionInterval={predictionInterval}
                  onIntervalChange={setPredictionInterval}
                />
              </TabsContent>

              <TabsContent value="bank" className="space-y-4 mt-0">
                <BankrollManager 
                  predictionState={predictionState}
                  currentPrediction={currentPrediction}
                  galeLevel={galeLevel}
                  lastRound={lastRound}
                  baseBet={baseBet}
                  setBaseBet={setBaseBet}
                  totalProfit={totalProfit}
                  resetProfit={resetProfit}
                />
              </TabsContent>

              <TabsContent value="auto" className="space-y-4 mt-0">
                <AutoBetPanel
                  predictionState={predictionState}
                  currentPrediction={currentPrediction}
                  galeLevel={galeLevel}
                  lastRound={lastRound}
                />
                <ExtensionPanel
                  currentPrediction={currentPrediction}
                  betAmount={baseBet}
                  galeLevel={galeLevel}
                />
              </TabsContent>

              <TabsContent value="settings" className="space-y-4 mt-0">
                <SettingsPanel
                  predictionInterval={predictionInterval}
                  onIntervalChange={setPredictionInterval}
                  baseBet={baseBet}
                  setBaseBet={setBaseBet}
                  useAI={useAI}
                  setUseAI={setUseAI}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Desktop Layout - 3 Column Grid */}
          <div className="hidden lg:grid lg:grid-cols-12 gap-6">
            {/* Left Column - Live Game */}
            <div className="lg:col-span-3 space-y-6">
              <CountdownTimer lastRoundTimestamp={lastRound?.timestamp || null} />
              <LiveWheel lastRound={lastRound} />
              <HistoryPanel rounds={rounds} />
            </div>

            {/* Center Column - Signals & Analysis */}
            <div className="lg:col-span-5 space-y-6">
              <SignalPanel 
                signals={signals}
                predictionState={predictionState}
                currentPrediction={currentPrediction}
                roundsUntilNextPrediction={roundsUntilNextPrediction}
              />
              <BetHistoryPanel signals={signals} />
              <PatternChart rounds={rounds} />
            </div>

            {/* Right Column - AI, Bankroll, Auto-Bet & Settings */}
            <div className="lg:col-span-4 space-y-6">
              <Tabs defaultValue="control" className="w-full">
                <TabsList className="w-full grid grid-cols-3 mb-4 bg-card/50">
                  <TabsTrigger value="control" className="text-xs">Controle</TabsTrigger>
                  <TabsTrigger value="auto" className="text-xs">Automação</TabsTrigger>
                  <TabsTrigger value="settings" className="text-xs">Config</TabsTrigger>
                </TabsList>

                <TabsContent value="control" className="space-y-6 mt-0">
                  <AIPanel
                    prediction={aiPrediction}
                    stats={aiStats}
                    isLoading={isAILoading}
                    useAI={useAI}
                    onToggleAI={setUseAI}
                    consecutiveLosses={consecutiveLosses}
                    isRecalibrating={isRecalibrating}
                    predictionInterval={predictionInterval}
                    onIntervalChange={setPredictionInterval}
                  />
                  <BankrollManager 
                    predictionState={predictionState}
                    currentPrediction={currentPrediction}
                    galeLevel={galeLevel}
                    lastRound={lastRound}
                    baseBet={baseBet}
                    setBaseBet={setBaseBet}
                    totalProfit={totalProfit}
                    resetProfit={resetProfit}
                  />
                  <StatsPanel stats={stats} />
                </TabsContent>

                <TabsContent value="auto" className="space-y-6 mt-0">
                  <AutoBetPanel
                    predictionState={predictionState}
                    currentPrediction={currentPrediction}
                    galeLevel={galeLevel}
                    lastRound={lastRound}
                  />
                </TabsContent>

                <TabsContent value="settings" className="mt-0">
                  <SettingsPanel
                    predictionInterval={predictionInterval}
                    onIntervalChange={setPredictionInterval}
                    baseBet={baseBet}
                    setBaseBet={setBaseBet}
                    useAI={useAI}
                    setUseAI={setUseAI}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-border/30 bg-card/30 mt-6 sm:mt-8">
          <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 max-w-7xl">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] sm:text-xs text-muted-foreground text-center sm:text-left">
              <p>⚠️ Sistema para fins educacionais. Jogue com responsabilidade.</p>
              <p>
                IA Adaptativa • Martingale • <span className="text-primary">v3.0</span>
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;
