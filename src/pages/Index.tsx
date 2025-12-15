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
import { Flame, Brain, Activity, BarChart3, Wallet, Target } from 'lucide-react';

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
    // AI features
    useAI,
    setUseAI,
    isAILoading,
    aiPrediction,
    aiStats,
    consecutiveLosses,
    isRecalibrating,
  } = useBlazeData();

  const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;

  const wins = signals.filter(s => s.status === 'win').length;
  const losses = signals.filter(s => s.status === 'loss').length;
  const total = wins + losses;
  const winRate = total > 0 ? (wins / total) * 100 : 0;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Scan line effect */}
      <div className="scan-line fixed inset-0 pointer-events-none z-50" />
      
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
        <header className="border-b border-border/50 bg-card/50 backdrop-blur-xl sticky top-0 z-40">
          <div className="container mx-auto px-4 py-4 max-w-7xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/20 neon-border">
                  <Flame className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl font-display font-bold tracking-tight">
                    <span className="danger-text">BLAZE</span>
                    <span className="text-foreground"> PRO</span>
                  </h1>
                  <p className="text-xs text-muted-foreground hidden md:block">
                    Sistema Inteligente de Análise
                  </p>
                </div>
              </div>

              {/* Status Badges */}
              <div className="flex items-center gap-2">
                {useAI && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30">
                    <Brain className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold text-primary">IA ATIVA</span>
                  </div>
                )}
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${
                  connectionStatus === 'connected' 
                    ? 'bg-primary/10 border border-primary/30' 
                    : 'bg-muted border border-border'
                }`}>
                  <div className={`h-2 w-2 rounded-full ${
                    connectionStatus === 'connected' ? 'bg-primary animate-pulse' : 'bg-muted-foreground'
                  }`} />
                  <span className={`text-xs font-medium ${
                    connectionStatus === 'connected' ? 'text-primary' : 'text-muted-foreground'
                  }`}>
                    {connectionStatus === 'connected' ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Quick Stats Bar */}
        <div className="border-b border-border/30 bg-card/30 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-3 max-w-7xl">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                <Activity className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Rodadas</p>
                  <p className="text-sm font-bold">{rounds.length}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                <Target className="h-4 w-4 text-blaze-gold" />
                <div>
                  <p className="text-xs text-muted-foreground">Sinais</p>
                  <p className="text-sm font-bold">{signals.length}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                <BarChart3 className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Taxa Win</p>
                  <p className="text-sm font-bold text-primary">{winRate.toFixed(0)}%</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                <Wallet className="h-4 w-4 text-accent" />
                <div>
                  <p className="text-xs text-muted-foreground">W/L</p>
                  <p className="text-sm font-bold">
                    <span className="text-primary">{wins}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-accent">{losses}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-6 max-w-7xl">
          {/* Connection Panel */}
          <div className="mb-6">
            <ConnectionPanel
              status={connectionStatus}
              isSimulating={isSimulating}
              onConnect={connectToBlaze}
              onDisconnect={disconnect}
              onStartSimulation={startSimulation}
              onStopSimulation={stopSimulation}
            />
          </div>

          {/* Main Dashboard Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column - Live Game */}
            <div className="lg:col-span-3 space-y-6">
              <CountdownTimer lastRoundTimestamp={lastRound?.timestamp || null} />
              <LiveWheel lastRound={lastRound} />
              <HistoryPanel rounds={rounds} />
            </div>

            {/* Center Column - Signals & Analysis */}
            <div className="lg:col-span-5 space-y-6">
              <SignalPanel signals={signals} />
              <PatternChart rounds={rounds} />
            </div>

            {/* Right Column - AI & Bankroll */}
            <div className="lg:col-span-4 space-y-6">
              <AIPanel
                prediction={aiPrediction}
                stats={aiStats}
                isLoading={isAILoading}
                useAI={useAI}
                onToggleAI={setUseAI}
                consecutiveLosses={consecutiveLosses}
                isRecalibrating={isRecalibrating}
              />
              <BankrollManager consecutiveLosses={consecutiveLosses} />
              <StatsPanel stats={stats} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-border/30 bg-card/30 mt-8">
          <div className="container mx-auto px-4 py-4 max-w-7xl">
            <div className="flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
              <p>
                ⚠️ Este sistema é para fins educacionais. Jogue com responsabilidade.
              </p>
              <p>
                IA Adaptativa • Martingale Integrado • <span className="text-primary">v3.0</span>
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;
