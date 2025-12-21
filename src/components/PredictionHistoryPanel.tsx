// Prediction History Panel - shows all predictions with results in real-time sequence

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, TrendingUp, TrendingDown, Clock, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ColorBall } from './ColorBall';
import { Button } from './ui/button';

interface PredictionRecord {
  id: string;
  predicted_color: string;
  confidence: number;
  reason: string;
  status: string;
  actual_result: string | null;
  signal_timestamp: string;
  created_at: string;
  protections: number;
}

export function PredictionHistoryPanel() {
  const [predictions, setPredictions] = useState<PredictionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, wins: 0, losses: 0, pending: 0 });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load predictions from database
  const loadPredictions = async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    
    try {
      const { data, error } = await supabase
        .from('prediction_signals')
        .select('*')
        .order('signal_timestamp', { ascending: false })
        .limit(200);

      if (error) {
        console.error('Error loading predictions:', error);
        return;
      }

      if (data) {
        setPredictions(data);
        
        // Calculate stats
        const wins = data.filter(p => p.status === 'won').length;
        const losses = data.filter(p => p.status === 'lost').length;
        const pending = data.filter(p => p.status === 'pending').length;
        
        setStats({
          total: data.length,
          wins,
          losses,
          pending
        });
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Load on mount and set up realtime subscription
  useEffect(() => {
    loadPredictions();

    // Subscribe to realtime updates for new predictions
    const channel = supabase
      .channel('prediction-history-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'prediction_signals'
        },
        (payload) => {
          console.log('📥 Nova previsão recebida:', payload.new);
          // Add new prediction to the top of the list
          setPredictions(prev => {
            const newPrediction = payload.new as PredictionRecord;
            // Avoid duplicates
            if (prev.some(p => p.id === newPrediction.id)) return prev;
            return [newPrediction, ...prev].slice(0, 200);
          });
          
          // Update stats
          setStats(prev => ({
            ...prev,
            total: prev.total + 1,
            pending: prev.pending + 1
          }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'prediction_signals'
        },
        (payload) => {
          console.log('📝 Previsão atualizada:', payload.new);
          const updated = payload.new as PredictionRecord;
          
          setPredictions(prev => 
            prev.map(p => p.id === updated.id ? updated : p)
          );
          
          // Update stats based on status change
          if (updated.status === 'won' || updated.status === 'lost') {
            setStats(prev => ({
              ...prev,
              wins: updated.status === 'won' ? prev.wins + 1 : prev.wins,
              losses: updated.status === 'lost' ? prev.losses + 1 : prev.losses,
              pending: Math.max(0, prev.pending - 1)
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const winRate = stats.wins + stats.losses > 0
    ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1)
    : '0';

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'won':
        return <Badge className="bg-green-500 text-white">✅ Acerto</Badge>;
      case 'lost':
        return <Badge variant="destructive">❌ Erro</Badge>;
      default:
        return <Badge variant="secondary" className="animate-pulse">⏳ Aguardando</Badge>;
    }
  };

  const getSequenceNumber = (index: number) => {
    return predictions.length - index;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Histórico de Previsões
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => loadPredictions(true)}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Badge variant="outline" className="font-normal">
              {predictions.length} registros
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Summary */}
        <div className="grid grid-cols-5 gap-2">
          <div className="bg-secondary/50 rounded-lg p-2 text-center">
            <p className="text-xl font-bold text-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="bg-green-500/20 rounded-lg p-2 text-center">
            <p className="text-xl font-bold text-green-500">{stats.wins}</p>
            <p className="text-xs text-muted-foreground">Acertos</p>
          </div>
          <div className="bg-red-500/20 rounded-lg p-2 text-center">
            <p className="text-xl font-bold text-red-500">{stats.losses}</p>
            <p className="text-xs text-muted-foreground">Erros</p>
          </div>
          <div className="bg-yellow-500/20 rounded-lg p-2 text-center">
            <p className="text-xl font-bold text-yellow-500">{stats.pending}</p>
            <p className="text-xs text-muted-foreground">Pendentes</p>
          </div>
          <div className="bg-primary/20 rounded-lg p-2 text-center">
            <p className="text-xl font-bold text-primary">{winRate}%</p>
            <p className="text-xs text-muted-foreground">Taxa</p>
          </div>
        </div>

        {/* Predictions List */}
        <ScrollArea className="h-[500px] pr-4" ref={scrollRef}>
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">Carregando...</p>
            </div>
          ) : predictions.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">Nenhuma previsão registrada</p>
            </div>
          ) : (
            <div className="space-y-2">
              {predictions.map((prediction, index) => (
                <div
                  key={prediction.id}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                    prediction.status === 'won' 
                      ? 'bg-green-500/10 border-green-500/30' 
                      : prediction.status === 'lost'
                      ? 'bg-red-500/10 border-red-500/30'
                      : 'bg-secondary/30 border-border'
                  } ${prediction.status === 'pending' ? 'ring-2 ring-primary/30' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    {/* Sequence Number */}
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
                      #{getSequenceNumber(index)}
                    </div>
                    
                    <ColorBall 
                      color={prediction.predicted_color as 'red' | 'black' | 'white'} 
                      size="sm" 
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold uppercase text-sm">
                          {prediction.predicted_color === 'red' ? 'Vermelho' : prediction.predicted_color === 'black' ? 'Preto' : 'Branco'}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {prediction.confidence}%
                        </Badge>
                        {prediction.protections > 0 && prediction.status === 'pending' && (
                          <Badge variant="secondary" className="text-xs">
                            +{prediction.protections} proteções
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px] md:max-w-[300px]">
                        {prediction.reason}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {prediction.actual_result && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span>→</span>
                        <ColorBall 
                          color={prediction.actual_result as 'red' | 'black' | 'white'} 
                          size="sm" 
                        />
                      </div>
                    )}
                    <div className="text-right">
                      {getStatusBadge(prediction.status)}
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(prediction.signal_timestamp), 'dd/MM HH:mm:ss')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
