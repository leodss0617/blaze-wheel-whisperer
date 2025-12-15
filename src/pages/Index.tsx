import { useBlazeData } from '@/hooks/useBlazeData';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { LiveWheel } from '@/components/LiveWheel';
import { HistoryPanel } from '@/components/HistoryPanel';
import { StatsPanel } from '@/components/StatsPanel';
import { SignalPanel } from '@/components/SignalPanel';
import { PatternChart } from '@/components/PatternChart';
import { AIPanel } from '@/components/AIPanel';
import { Flame, AlertTriangle, Brain } from 'lucide-react';

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
    getAIPrediction,
  } = useBlazeData();

  const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;

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

      <div className="relative z-10 container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-accent/20 neon-border">
              <Flame className="h-8 w-8 text-accent" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
                <span className="danger-text">BLAZE</span>
                <span className="text-foreground"> ANALYZER</span>
              </h1>
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                Análise de padrões em tempo real para o Double
                {useAI && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs">
                    <Brain className="h-3 w-3" />
                    IA Ativa
                  </span>
                )}
              </p>
            </div>
          </div>
        </header>

        {/* Warning Banner */}
        <div className="mb-6 p-3 rounded-lg bg-blaze-gold/10 border border-blaze-gold/30 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-blaze-gold flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-blaze-gold">Aviso Importante</p>
            <p className="text-muted-foreground">
              Este bot é apenas para fins educacionais. Jogos de azar envolvem riscos. 
              Jogue com responsabilidade e nunca aposte mais do que pode perder.
            </p>
          </div>
        </div>

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

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column - Live + History */}
          <div className="lg:col-span-3 space-y-6">
            <LiveWheel lastRound={lastRound} />
            <HistoryPanel rounds={rounds} />
          </div>

          {/* Center Column - Signals + Chart */}
          <div className="lg:col-span-5 space-y-6">
            <SignalPanel signals={signals} />
            <PatternChart rounds={rounds} />
          </div>

          {/* Right Column - Stats + AI */}
          <div className="lg:col-span-4 space-y-6">
            <AIPanel
              prediction={aiPrediction}
              stats={aiStats}
              isLoading={isAILoading}
              useAI={useAI}
              onToggleAI={setUseAI}
              onRequestPrediction={getAIPrediction}
            />
            <StatsPanel stats={stats} />
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 text-center text-xs text-muted-foreground">
          <p>
            Desenvolvido para análise estatística • IA adaptativa integrada •{' '}
            <span className="text-primary">v2.0</span>
          </p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
