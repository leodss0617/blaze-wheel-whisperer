import { useCallback, useRef } from 'react';

// Helper to check if sounds are enabled in settings
const isSoundEnabled = (): boolean => {
  try {
    const saved = localStorage.getItem('blaze-settings');
    if (saved) {
      const settings = JSON.parse(saved);
      return settings.soundEnabled !== false;
    }
    return true; // Default to enabled
  } catch {
    return true;
  }
};

// Helper to get sound volume from settings (0-100)
const getSoundVolume = (): number => {
  try {
    const saved = localStorage.getItem('blaze-settings');
    if (saved) {
      const settings = JSON.parse(saved);
      return (settings.soundVolume ?? 70) / 100;
    }
    return 0.7; // Default 70%
  } catch {
    return 0.7;
  }
};

export function useAlertSound() {
  const audioContextRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  const playAlertSound = useCallback((isHighConfidence: boolean = false) => {
    if (!isSoundEnabled()) return;
    
    try {
      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const volume = getSoundVolume();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      if (isHighConfidence) {
        // High confidence: ascending tones
        oscillator.frequency.setValueAtTime(440, ctx.currentTime);
        oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
        oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.3 * volume, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.4);
      } else {
        // Normal signal: single beep
        oscillator.frequency.setValueAtTime(520, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.2 * volume, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.2);
      }
    } catch (error) {
      console.log('Audio not available:', error);
    }
  }, [getAudioContext]);

  // White protection alert - distinct chime sound
  const playWhiteProtectionSound = useCallback((confidence: number) => {
    if (!isSoundEnabled()) return;
    
    try {
      const ctx = getAudioContext();
      const volume = getSoundVolume();
      
      const isStrong = confidence >= 70;
      const isMedium = confidence >= 55;
      
      // Create multiple oscillators for a richer sound
      const createTone = (freq: number, startTime: number, duration: number, baseVolume: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
        osc.type = 'sine';
        gain.gain.setValueAtTime(baseVolume * volume, ctx.currentTime + startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + startTime + duration);
        osc.start(ctx.currentTime + startTime);
        osc.stop(ctx.currentTime + startTime + duration);
      };
      
      if (isStrong) {
        // Strong protection: Urgent chime (white = danger warning)
        createTone(1047, 0, 0.15, 0.3);      // C6
        createTone(1319, 0.1, 0.15, 0.3);    // E6
        createTone(1568, 0.2, 0.15, 0.3);    // G6
        createTone(1047, 0.35, 0.25, 0.25);  // C6 again
        createTone(1568, 0.35, 0.25, 0.25);  // G6 sustained
      } else if (isMedium) {
        // Medium protection: Softer warning
        createTone(880, 0, 0.2, 0.2);        // A5
        createTone(1047, 0.15, 0.2, 0.2);    // C6
      } else {
        // Low protection: Just a subtle ping
        createTone(784, 0, 0.15, 0.15);      // G5
      }
    } catch (error) {
      console.log('Audio not available:', error);
    }
  }, [getAudioContext]);

  return { playAlertSound, playWhiteProtectionSound };
}
