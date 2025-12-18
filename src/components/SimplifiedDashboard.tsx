// Simplified dashboard - focused on data collection and predictions only

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Wifi, WifiOff, TrendingUp, Target, Shield, Clock, Activity } from 'lucide-react';
import { useDataCollector } from '@/hooks/useDataCollector';
import { usePredictionEngine } from '@/hooks/usePredictionEngine';
import { ColorBall } from '@/components/ColorBall';
import { format } from 'date-fns';

export function SimplifiedDashboard() {
  const [predictionEnabled, setPredictionEnabled] = useState(true);
  const [intervalRounds, setIntervalRounds] = useState(2);
  
  const { rounds, colors, numbers, isConnected, lastUpdate, error } = useDataCollector();
  
  const { 
    currentSignal, 
    whiteProtection, 
    isAnalyzing, 
    lastAnalysis,
    stats 
  } = usePredictionEngine({ 
    colors, 
    numbers, 
    enabled: predictionEnabled, 
    intervalRounds 
  });

  const winRate = stats.wins + stats.losses > 0 
    ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1) 
    : '0';

  return (
    <div className="min-h-screen bg-background p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Blaze Predictor</h1>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/50">
              <Wifi className="w-3 h-3 mr-1" />
              Conectado
            </Badge>
          ) : (
            <Badge variant="destructive">
              <WifiOff className="w-3 h-3 mr-1" />
              Desconectado
            </Badge>
          )}
        </div>
      </div>

      {/* Connection Status */}
      {error && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="p-3">
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Current Prediction */}
        <Card className={`${currentSignal ? (currentSignal.color === 'red' ? 'border-red-500 bg-red-500/10' : 'border-gray-700 bg-gray-900/50') : 'border-border'}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="w-5 h-5" />
              Previsão Atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentSignal ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ColorBall color={currentSignal.color} size="lg" />
                    <div>
                      <p className="text-2xl font-bold uppercase">
                        {currentSignal.color === 'red' ? 'VERMELHO' : 'PRETO'}
                      </p>
                      <p className="text-sm text-muted-foreground">{currentSignal.strategy}</p>
                    </div>
                  </div>
                  <Badge 
                    variant={currentSignal.confidence >= 75 ? 'default' : 'secondary'}
                    className={currentSignal.confidence >= 75 ? 'bg-green-500' : ''}
                  >
                    {currentSignal.confidence}%
                  </Badge>
                </div>
                <Progress value={currentSignal.confidence} className="h-2" />
                <p className="text-sm text-muted-foreground">{currentSignal.reason}</p>
                {currentSignal.status !== 'pending' && (
                  <Badge variant={currentSignal.status === 'won' ? 'default' : 'destructive'}>
                    {currentSignal.status === 'won' ? '✅ ACERTO' : '❌ ERRO'}
                  </Badge>
                )}
              </div>
            ) : (
              <div className="text-center py-6">
                {isAnalyzing ? (
                  <div className="flex items-center justify-center gap-2">
                    <Activity className="w-5 h-5 animate-pulse" />
                    <span>Analisando...</span>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Aguardando dados...</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* White Protection */}
        <Card className={`${whiteProtection?.shouldProtect ? 'border-white bg-white/10' : 'border-border'}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Proteção Branco
            </CardTitle>
          </CardHeader>
          <CardContent>
            {whiteProtection ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-semibold">
                      {whiteProtection.roundsSinceWhite} rodadas sem ⚪
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Média: {whiteProtection.avgGap.toFixed(0)} rodadas
                    </p>
                  </div>
                  <Badge 
                    variant={whiteProtection.shouldProtect ? 'default' : 'secondary'}
                    className={whiteProtection.shouldProtect ? 'bg-yellow-500 text-black' : ''}
                  >
                    {whiteProtection.confidence}%
                  </Badge>
                </div>
                <Progress value={whiteProtection.confidence} className="h-2" />
                <p className="text-sm text-muted-foreground">{whiteProtection.reason}</p>
                {whiteProtection.shouldProtect && (
                  <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50">
                    ⚠️ Recomenda proteção
                  </Badge>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-6">Aguardando dados...</p>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Estatísticas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-green-500">{stats.wins}</p>
                <p className="text-sm text-muted-foreground">Acertos</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-500">{stats.losses}</p>
                <p className="text-sm text-muted-foreground">Erros</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">{winRate}%</p>
                <p className="text-sm text-muted-foreground">Taxa</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Controls */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Configurações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span>Previsões automáticas</span>
              <Switch 
                checked={predictionEnabled} 
                onCheckedChange={setPredictionEnabled}
              />
            </div>
            <div className="flex items-center justify-between">
              <span>Intervalo (rodadas)</span>
              <select 
                value={intervalRounds}
                onChange={(e) => setIntervalRounds(Number(e.target.value))}
                className="bg-secondary rounded px-3 py-1"
              >
                {[1, 2, 3, 5, 10].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            {lastUpdate && (
              <p className="text-xs text-muted-foreground">
                Última atualização: {format(lastUpdate, 'HH:mm:ss')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Últimas Rodadas ({rounds.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {rounds.slice(0, 50).map((round) => (
              <ColorBall 
                key={round.id} 
                color={round.color} 
                size="sm"
                number={round.number}
                showNumber={true}
              />
            ))}
          </div>
          {lastAnalysis && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div className="bg-secondary/50 rounded p-2">
                <p className="text-muted-foreground">Gap Vermelho</p>
                <p className="font-semibold">{lastAnalysis.redGap} (média: {lastAnalysis.avgRedGap.toFixed(1)})</p>
              </div>
              <div className="bg-secondary/50 rounded p-2">
                <p className="text-muted-foreground">Gap Preto</p>
                <p className="font-semibold">{lastAnalysis.blackGap} (média: {lastAnalysis.avgBlackGap.toFixed(1)})</p>
              </div>
              <div className="bg-secondary/50 rounded p-2">
                <p className="text-muted-foreground">Sequência atual</p>
                <p className="font-semibold">{lastAnalysis.currentStreak.count}x {lastAnalysis.currentStreak.color}</p>
              </div>
              <div className="bg-secondary/50 rounded p-2">
                <p className="text-muted-foreground">Últimas 10</p>
                <p className="font-semibold">🔴{lastAnalysis.last10.red} ⚫{lastAnalysis.last10.black} ⚪{lastAnalysis.last10.white}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
