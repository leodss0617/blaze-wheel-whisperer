// Simplified data collector - fetches and stores rounds from Blaze API

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Round, Color } from '@/types/prediction';

interface BlazeAPIGame {
  id: string;
  color: number;
  roll: number;
  created_at: string;
}

const POLL_INTERVAL = 3000; // 3 seconds
const MAX_ROUNDS_HISTORY = 500; // Increased from 200 to 500 for more comprehensive analysis

export function useDataCollector() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const processedIds = useRef<Set<string>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Convert Blaze color code to Color type
  const parseColor = (colorCode: number): Color => {
    if (colorCode === 0) return 'white';
    if (colorCode === 1) return 'red';
    return 'black';
  };

  // Create unique round ID
  const createRoundId = (game: BlazeAPIGame): string => {
    const timestamp = new Date(game.created_at).getTime();
    return `${game.id}_${game.roll}_${timestamp}`;
  };

  // Fetch rounds from proxy
  const fetchRounds = useCallback(async () => {
    try {
      const { data, error: proxyError } = await supabase.functions.invoke('blaze-proxy', {
        body: { limit: MAX_ROUNDS_HISTORY } // Request up to MAX_ROUNDS_HISTORY
      });

      if (proxyError) {
        console.error('Proxy error:', proxyError);
        setError('Erro ao conectar com Blaze');
        setIsConnected(false);
        return;
      }

      // Proxy returns array directly, or it might be wrapped
      const records = Array.isArray(data) ? data : (data?.rounds || data?.records || []);
      
      if (!records.length) {
        console.log('No records received from proxy:', data);
        setError('Sem dados da Blaze');
        return;
      }

      console.log(`✅ Received ${records.length} records from Blaze`);
      setIsConnected(true);
      setError(null);
      setLastUpdate(new Date());

      // Process new rounds
      const newRounds: Round[] = [];
      
      for (const game of records) {
        const roundId = createRoundId(game);
        
        if (!processedIds.current.has(roundId)) {
          processedIds.current.add(roundId);
          
          const round: Round = {
            id: roundId,
            blazeId: game.id,
            color: parseColor(game.color),
            number: game.roll,
            timestamp: new Date(game.created_at)
          };
          
          newRounds.push(round);
          
          // Save to database (fire and forget)
          saveRoundToDb(round);
        }
      }

      if (newRounds.length > 0) {
        setRounds(prev => {
          const combined = [...newRounds, ...prev];
          // Keep only last MAX_ROUNDS_HISTORY rounds in memory
          return combined.slice(0, MAX_ROUNDS_HISTORY);
        });
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Erro de conexão');
      setIsConnected(false);
    }
  }, []);

  // Save round to database
  const saveRoundToDb = async (round: Round) => {
    try {
      await supabase.from('blaze_rounds').upsert({
        id: round.id,
        blaze_id: round.blazeId,
        color: round.color,
        number: round.number,
        round_timestamp: round.timestamp.toISOString()
      }, { onConflict: 'blaze_id' });
    } catch (err) {
      console.error('Error saving round:', err);
    }
  };

  // Start/stop polling
  useEffect(() => {
    // Initial fetch
    fetchRounds();
    
    // Start polling
    intervalRef.current = setInterval(fetchRounds, POLL_INTERVAL);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchRounds]);

  // Get colors array for analysis
  const colors = rounds.map(r => r.color);
  const numbers = rounds.map(r => r.number);

  return {
    rounds,
    colors,
    numbers,
    isConnected,
    lastUpdate,
    error
  };
}