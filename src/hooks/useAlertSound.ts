import { useCallback, useRef } from 'react';

export function useAlertSound() {
  const audioContextRef = useRef<AudioContext | null>(null);

  const playAlertSound = useCallback((isHighConfidence: boolean = false) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      if (isHighConfidence) {
        // High confidence: ascending tones
        oscillator.frequency.setValueAtTime(440, ctx.currentTime);
        oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
        oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.4);
      } else {
        // Normal signal: single beep
        oscillator.frequency.setValueAtTime(520, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.2);
      }
    } catch (error) {
      console.log('Audio not available:', error);
    }
  }, []);

  return { playAlertSound };
}
