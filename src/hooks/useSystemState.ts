// Sistema de Estado Centralizado
// Todas as partes do sistema se comunicam através deste hook

import { useState, useCallback, useEffect, useRef } from 'react';
import type { BlazeRound, BlazeColor, PredictionSignal, PredictionState } from '@/types/blaze';

export interface SystemState {
  // Prediction state
  currentPrediction: PredictionSignal | null;
  predictionState: PredictionState;
  galeLevel: number;
  
  // Round tracking
  lastRound: BlazeRound | null;
  roundHistory: BlazeRound[];
  
  // White protection
  whiteProtectionActive: boolean;
  whiteProtectionConfidence: number;
  
  // Bankroll
  currentBankroll: number;
  targetProfit: number;
  dailyProfit: number;
  
  // Extension
  extensionConnected: boolean;
  extensionEnabled: boolean;
  
  // Stats
  totalWins: number;
  totalLosses: number;
  winRate: number;
  
  // Unique round tracking
  processedRoundKeys: Set<string>;
}

export interface SystemEvent {
  type: 'NEW_PREDICTION' | 'PREDICTION_RESULT' | 'NEW_ROUND' | 'WHITE_PROTECTION' | 
        'BANKROLL_UPDATE' | 'EXTENSION_STATUS' | 'GALE_TRIGGERED';
  payload: any;
  timestamp: number;
}

// Create unique key for a round - ensures consecutive rounds with same number are unique
export function createRoundKey(round: BlazeRound): string {
  const timestamp = round.timestamp instanceof Date 
    ? round.timestamp.getTime() 
    : new Date(round.timestamp).getTime();
  return `${round.id}_${round.number}_${round.color}_${timestamp}`;
}

// Check if two rounds are the same (by key)
export function isSameRound(round1: BlazeRound | null, round2: BlazeRound | null): boolean {
  if (!round1 || !round2) return false;
  return createRoundKey(round1) === createRoundKey(round2);
}

// Check if a round is a duplicate in the history
export function isNewRound(round: BlazeRound, history: BlazeRound[]): boolean {
  const key = createRoundKey(round);
  return !history.some(r => createRoundKey(r) === key);
}

const STORAGE_KEY = 'blaze-system-state';

export function useSystemState() {
  const [state, setState] = useState<SystemState>(() => {
    // Load initial state from localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    const defaultState: SystemState = {
      currentPrediction: null,
      predictionState: 'analyzing',
      galeLevel: 0,
      lastRound: null,
      roundHistory: [],
      whiteProtectionActive: false,
      whiteProtectionConfidence: 0,
      currentBankroll: parseFloat(localStorage.getItem('blaze-bankroll') || '0'),
      targetProfit: parseFloat(localStorage.getItem('blaze-target-profit') || '0'),
      dailyProfit: parseFloat(localStorage.getItem('blaze-total-profit') || '0'),
      extensionConnected: false,
      extensionEnabled: false,
      totalWins: 0,
      totalLosses: 0,
      winRate: 0,
      processedRoundKeys: new Set(),
    };
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...defaultState,
          ...parsed,
          processedRoundKeys: new Set(parsed.processedRoundKeys || []),
        };
      } catch {
        return defaultState;
      }
    }
    return defaultState;
  });
  
  const eventListeners = useRef<((event: SystemEvent) => void)[]>([]);
  
  // Emit event to all listeners
  const emitEvent = useCallback((type: SystemEvent['type'], payload: any) => {
    const event: SystemEvent = {
      type,
      payload,
      timestamp: Date.now(),
    };
    
    console.log('🔔 System Event:', type, payload);
    
    eventListeners.current.forEach(listener => {
      try {
        listener(event);
      } catch (e) {
        console.error('Error in event listener:', e);
      }
    });
  }, []);
  
  // Subscribe to events
  const subscribe = useCallback((listener: (event: SystemEvent) => void) => {
    eventListeners.current.push(listener);
    return () => {
      eventListeners.current = eventListeners.current.filter(l => l !== listener);
    };
  }, []);
  
  // Track new round
  const addRound = useCallback((round: BlazeRound) => {
    const key = createRoundKey(round);
    
    setState(prev => {
      // Check if already processed
      if (prev.processedRoundKeys.has(key)) {
        console.log('⏭️ Round already processed:', key);
        return prev;
      }
      
      // Add to processed keys
      const newProcessedKeys = new Set(prev.processedRoundKeys);
      newProcessedKeys.add(key);
      
      // Log unique round detection
      console.log(`📍 Nova rodada única: ${round.color.toUpperCase()} ${round.number} [${key}]`);
      
      // Emit event
      emitEvent('NEW_ROUND', { round, key });
      
      return {
        ...prev,
        lastRound: round,
        roundHistory: [...prev.roundHistory, round].slice(-100),
        processedRoundKeys: newProcessedKeys,
      };
    });
  }, [emitEvent]);
  
  // Update prediction state
  const setPrediction = useCallback((prediction: PredictionSignal | null, newState?: PredictionState, gale?: number) => {
    setState(prev => {
      const updated = {
        ...prev,
        currentPrediction: prediction,
        predictionState: newState ?? (prediction ? 'active' : 'analyzing'),
        galeLevel: gale ?? (prediction ? 0 : prev.galeLevel),
      };
      
      if (prediction) {
        emitEvent('NEW_PREDICTION', {
          prediction,
          state: updated.predictionState,
          galeLevel: updated.galeLevel,
        });
      }
      
      return updated;
    });
  }, [emitEvent]);
  
  // Record prediction result
  const recordResult = useCallback((won: boolean, actualColor: BlazeColor) => {
    setState(prev => {
      const newWins = won ? prev.totalWins + 1 : prev.totalWins;
      const newLosses = !won ? prev.totalLosses + 1 : prev.totalLosses;
      const total = newWins + newLosses;
      
      emitEvent('PREDICTION_RESULT', {
        won,
        actualColor,
        prediction: prev.currentPrediction,
        galeLevel: prev.galeLevel,
      });
      
      return {
        ...prev,
        totalWins: newWins,
        totalLosses: newLosses,
        winRate: total > 0 ? (newWins / total) * 100 : 0,
      };
    });
  }, [emitEvent]);
  
  // Update white protection
  const setWhiteProtection = useCallback((active: boolean, confidence: number = 0) => {
    setState(prev => {
      if (prev.whiteProtectionActive === active && prev.whiteProtectionConfidence === confidence) {
        return prev;
      }
      
      if (active) {
        emitEvent('WHITE_PROTECTION', { active, confidence });
      }
      
      return {
        ...prev,
        whiteProtectionActive: active,
        whiteProtectionConfidence: confidence,
      };
    });
  }, [emitEvent]);
  
  // Update bankroll
  const updateBankroll = useCallback((bankroll: number, profit: number, target?: number) => {
    setState(prev => {
      emitEvent('BANKROLL_UPDATE', { bankroll, profit, target: target ?? prev.targetProfit });
      return {
        ...prev,
        currentBankroll: bankroll,
        dailyProfit: profit,
        targetProfit: target ?? prev.targetProfit,
      };
    });
  }, [emitEvent]);
  
  // Update extension status
  const setExtensionStatus = useCallback((connected: boolean, enabled: boolean) => {
    setState(prev => {
      if (prev.extensionConnected === connected && prev.extensionEnabled === enabled) {
        return prev;
      }
      
      emitEvent('EXTENSION_STATUS', { connected, enabled });
      return {
        ...prev,
        extensionConnected: connected,
        extensionEnabled: enabled,
      };
    });
  }, [emitEvent]);
  
  // Trigger gale
  const triggerGale = useCallback((level: number) => {
    setState(prev => {
      emitEvent('GALE_TRIGGERED', {
        level,
        prediction: prev.currentPrediction,
      });
      
      const newState: PredictionState = level === 1 ? 'gale1' : level === 2 ? 'gale2' : 'analyzing';
      
      return {
        ...prev,
        galeLevel: level,
        predictionState: newState,
      };
    });
  }, [emitEvent]);
  
  // Persist state changes
  useEffect(() => {
    const toSave = {
      ...state,
      processedRoundKeys: Array.from(state.processedRoundKeys).slice(-500), // Keep last 500 keys
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  }, [state]);
  
  return {
    state,
    addRound,
    setPrediction,
    recordResult,
    setWhiteProtection,
    updateBankroll,
    setExtensionStatus,
    triggerGale,
    subscribe,
    emitEvent,
    createRoundKey,
    isNewRound: (round: BlazeRound) => isNewRound(round, state.roundHistory),
  };
}

export type SystemStateHook = ReturnType<typeof useSystemState>;
