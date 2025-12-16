import { useState, useEffect, useCallback, useRef } from 'react';
import type { PredictionSignal, BlazeRound, BlazeColor } from '@/types/blaze';

interface ExtensionStatus {
  installed: boolean;
  connected: boolean;
  isEnabled: boolean;
  lastActivity: Date | null;
}

interface ExtensionResult {
  color: BlazeColor | null;
  number: number | null;
  timestamp: number;
}

interface ExtensionData {
  status: ExtensionStatus;
  results: ExtensionResult[];
  lastSignalSent: string | null;
  timerData: {
    phase: string;
    timeLeft: number | null;
  } | null;
}

const STORAGE_KEYS = {
  SIGNAL: 'blaze-auto-bet-signal',
  RESULTS: 'blaze-latest-results',
  INSTALLED: 'blaze-extension-installed',
  EXTENSION_STATUS: 'blaze-extension-status',
};

const BROADCAST_CHANNEL = 'blaze-auto-bet';

export function useExtensionBridge() {
  const [extensionData, setExtensionData] = useState<ExtensionData>({
    status: {
      installed: false,
      connected: false,
      isEnabled: false,
      lastActivity: null,
    },
    results: [],
    lastSignalSent: null,
    timerData: null,
  });

  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const lastSentTimestamp = useRef<number>(0);

  // Check if extension is installed
  const checkExtensionInstalled = useCallback(() => {
    try {
      const installed = localStorage.getItem(STORAGE_KEYS.INSTALLED) === 'true';
      return installed;
    } catch {
      return false;
    }
  }, []);

  // Get latest results from extension
  const getExtensionResults = useCallback((): ExtensionResult[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.RESULTS);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Error reading extension results:', e);
    }
    return [];
  }, []);

  // Send signal to extension
  const sendSignalToExtension = useCallback((
    color: 'red' | 'black',
    amount: number,
    confidence: number,
    galeLevel: number = 0
  ) => {
    const now = Date.now();
    
    // Prevent duplicate signals
    if (now - lastSentTimestamp.current < 1000) {
      console.log('📡 Signal throttled - too soon');
      return false;
    }

    const signal = {
      type: 'BET_SIGNAL',
      data: {
        color,
        amount,
        confidence,
        galeLevel,
        timestamp: now,
        shouldBet: true,
      }
    };

    console.log('📡 Sending signal to extension:', signal);

    // Method 1: localStorage
    try {
      localStorage.setItem(STORAGE_KEYS.SIGNAL, JSON.stringify(signal.data));
    } catch (e) {
      console.error('localStorage error:', e);
    }

    // Method 2: postMessage
    window.postMessage(signal, '*');

    // Method 3: BroadcastChannel
    try {
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage(signal);
      }
    } catch (e) {
      console.error('BroadcastChannel error:', e);
    }

    lastSentTimestamp.current = now;
    
    setExtensionData(prev => ({
      ...prev,
      lastSignalSent: `${color === 'red' ? 'VERMELHO' : 'PRETO'} - R$ ${amount.toFixed(2)}`,
      status: {
        ...prev.status,
        lastActivity: new Date(),
      }
    }));

    return true;
  }, []);

  // Send prediction signal
  const sendPrediction = useCallback((
    prediction: PredictionSignal | null,
    betAmount: number,
    galeLevel: number
  ) => {
    if (!prediction || prediction.predictedColor === 'white') {
      return false;
    }

    return sendSignalToExtension(
      prediction.predictedColor as 'red' | 'black',
      betAmount,
      prediction.confidence,
      galeLevel
    );
  }, [sendSignalToExtension]);

  // Convert extension results to BlazeRounds
  const convertResultsToRounds = useCallback((results: ExtensionResult[]): BlazeRound[] => {
    return results
      .filter(r => r.color !== null)
      .map((r, index) => ({
        id: `ext-${r.timestamp}-${index}`,
        color: r.color as BlazeColor,
        number: r.number ?? 0,
        timestamp: new Date(r.timestamp),
      }));
  }, []);

  // Listen for storage events from extension
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === STORAGE_KEYS.RESULTS && event.newValue) {
        try {
          const results = JSON.parse(event.newValue);
          setExtensionData(prev => ({
            ...prev,
            results,
            status: {
              ...prev.status,
              connected: true,
              lastActivity: new Date(),
            }
          }));
          console.log('📥 Results from extension:', results.length);
        } catch (e) {
          console.error('Error parsing extension results:', e);
        }
      }

      if (event.key === STORAGE_KEYS.INSTALLED) {
        setExtensionData(prev => ({
          ...prev,
          status: {
            ...prev.status,
            installed: event.newValue === 'true',
          }
        }));
      }

      if (event.key === STORAGE_KEYS.EXTENSION_STATUS && event.newValue) {
        try {
          const status = JSON.parse(event.newValue);
          setExtensionData(prev => ({
            ...prev,
            status: {
              ...prev.status,
              isEnabled: status.isEnabled,
              connected: true,
            }
          }));
        } catch (e) {
          console.error('Error parsing extension status:', e);
        }
      }
    };

    // Listen for postMessage from extension
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'EXTENSION_STATUS') {
        setExtensionData(prev => ({
          ...prev,
          status: {
            ...prev.status,
            connected: true,
            isEnabled: event.data.data?.isEnabled ?? false,
            lastActivity: new Date(),
          }
        }));
      }

      if (event.data?.type === 'NEW_RESULT') {
        const result = event.data.data as ExtensionResult;
        setExtensionData(prev => {
          const existing = prev.results.find(r => r.timestamp === result.timestamp);
          if (existing) return prev;
          
          return {
            ...prev,
            results: [result, ...prev.results].slice(0, 20),
            status: {
              ...prev.status,
              lastActivity: new Date(),
            }
          };
        });
      }

      if (event.data?.type === 'TIMER_UPDATE') {
        setExtensionData(prev => ({
          ...prev,
          timerData: event.data.data,
        }));
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('message', handleMessage);

    // Initialize BroadcastChannel
    try {
      broadcastChannelRef.current = new BroadcastChannel(BROADCAST_CHANNEL);
      broadcastChannelRef.current.onmessage = (event) => {
        console.log('📡 BroadcastChannel message:', event.data);
        if (event.data?.type === 'NEW_RESULT') {
          const result = event.data.data as ExtensionResult;
          setExtensionData(prev => ({
            ...prev,
            results: [result, ...prev.results].slice(0, 20),
            status: {
              ...prev.status,
              lastActivity: new Date(),
            }
          }));
        }
      };
    } catch (e) {
      console.warn('BroadcastChannel not supported');
    }

    // Initial check
    const installed = checkExtensionInstalled();
    const results = getExtensionResults();
    
    setExtensionData(prev => ({
      ...prev,
      status: {
        ...prev.status,
        installed,
        connected: results.length > 0,
      },
      results,
    }));

    // Periodic check
    const interval = setInterval(() => {
      const installed = checkExtensionInstalled();
      const results = getExtensionResults();
      
      setExtensionData(prev => {
        const newResultsCount = results.length;
        const prevResultsCount = prev.results.length;
        
        // Only update if there are changes
        if (installed !== prev.status.installed || newResultsCount !== prevResultsCount) {
          return {
            ...prev,
            status: {
              ...prev.status,
              installed,
              connected: newResultsCount > 0 && 
                (results[0]?.timestamp ?? 0) > Date.now() - 60000, // Active in last minute
            },
            results,
          };
        }
        return prev;
      });
    }, 3000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('message', handleMessage);
      clearInterval(interval);
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
      }
    };
  }, [checkExtensionInstalled, getExtensionResults]);

  // Request status from extension
  const requestExtensionStatus = useCallback(() => {
    window.postMessage({ type: 'GET_EXTENSION_STATUS' }, '*');
    try {
      const channel = new BroadcastChannel(BROADCAST_CHANNEL);
      channel.postMessage({ type: 'GET_STATUS' });
      setTimeout(() => channel.close(), 100);
    } catch (e) {
      // BroadcastChannel not available
    }
  }, []);

  return {
    extensionData,
    sendSignalToExtension,
    sendPrediction,
    convertResultsToRounds,
    requestExtensionStatus,
    isInstalled: extensionData.status.installed,
    isConnected: extensionData.status.connected,
  };
}
