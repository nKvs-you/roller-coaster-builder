/**
 * SoundEffects Component
 * 
 * Game-like sound effects for the roller coaster:
 * - Wind noise based on speed
 * - Chain lift clicking
 * - Loop whoosh
 * - Track rattling
 * - UI sounds
 */

import { useEffect, useRef, useCallback } from "react";
import { useRollerCoaster } from "@/lib/stores/useRollerCoaster";
import { useAudio } from "@/lib/stores/useAudio";

// Web Audio API types
interface SoundEffectsState {
  audioContext: AudioContext | null;
  masterGain: GainNode | null;
  windOscillator: OscillatorNode | null;
  windGain: GainNode | null;
  clickBuffer: AudioBuffer | null;
  whooshBuffer: AudioBuffer | null;
  rattleBuffer: AudioBuffer | null;
  lastClickTime: number;
}

// Generate white noise buffer
function createNoiseBuffer(audioContext: AudioContext, duration: number): AudioBuffer {
  const sampleRate = audioContext.sampleRate;
  const bufferSize = sampleRate * duration;
  const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
  const output = buffer.getChannelData(0);
  
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }
  
  return buffer;
}

// Generate a click sound
function createClickBuffer(audioContext: AudioContext): AudioBuffer {
  const sampleRate = audioContext.sampleRate;
  const duration = 0.05;
  const bufferSize = sampleRate * duration;
  const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
  const output = buffer.getChannelData(0);
  
  for (let i = 0; i < bufferSize; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 100);
    output[i] = envelope * (Math.random() * 0.5 + Math.sin(t * 2000) * 0.5);
  }
  
  return buffer;
}

// Generate whoosh sound
function createWhooshBuffer(audioContext: AudioContext): AudioBuffer {
  const sampleRate = audioContext.sampleRate;
  const duration = 0.5;
  const bufferSize = sampleRate * duration;
  const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
  const output = buffer.getChannelData(0);
  
  for (let i = 0; i < bufferSize; i++) {
    const t = i / sampleRate;
    const envelope = Math.sin(t * Math.PI / duration);
    const freq = 200 + t * 1000;
    output[i] = envelope * Math.sin(t * freq) * 0.3 + 
                envelope * (Math.random() * 2 - 1) * 0.2;
  }
  
  return buffer;
}

// Generate rattle sound
function createRattleBuffer(audioContext: AudioContext): AudioBuffer {
  const sampleRate = audioContext.sampleRate;
  const duration = 0.1;
  const bufferSize = sampleRate * duration;
  const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
  const output = buffer.getChannelData(0);
  
  for (let i = 0; i < bufferSize; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 50);
    // Multiple frequencies for metallic sound
    output[i] = envelope * (
      Math.sin(t * 800) * 0.3 +
      Math.sin(t * 1200) * 0.2 +
      Math.sin(t * 1800) * 0.1 +
      (Math.random() * 2 - 1) * 0.1
    );
  }
  
  return buffer;
}

export function SoundEffects() {
  const { isRiding, rideProgress, rideSpeed, hasChainLift, loopSegments, trackPoints } = useRollerCoaster();
  const { isMuted } = useAudio();
  
  const stateRef = useRef<SoundEffectsState>({
    audioContext: null,
    masterGain: null,
    windOscillator: null,
    windGain: null,
    clickBuffer: null,
    whooshBuffer: null,
    rattleBuffer: null,
    lastClickTime: 0,
  });
  
  const lastProgressRef = useRef(0);
  const wasInLoopRef = useRef(false);
  
  // Initialize audio context and buffers
  useEffect(() => {
    const initAudio = async () => {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        const masterGain = audioContext.createGain();
        masterGain.connect(audioContext.destination);
        masterGain.gain.value = isMuted ? 0 : 0.3;
        
        // Create wind noise source
        const noiseBuffer = createNoiseBuffer(audioContext, 2);
        const windGain = audioContext.createGain();
        windGain.connect(masterGain);
        windGain.gain.value = 0;
        
        // Create filter for wind
        const windFilter = audioContext.createBiquadFilter();
        windFilter.type = 'lowpass';
        windFilter.frequency.value = 500;
        windFilter.connect(windGain);
        
        // Create looping noise source
        const noiseSource = audioContext.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        noiseSource.loop = true;
        noiseSource.connect(windFilter);
        noiseSource.start();
        
        // Generate effect buffers
        const clickBuffer = createClickBuffer(audioContext);
        const whooshBuffer = createWhooshBuffer(audioContext);
        const rattleBuffer = createRattleBuffer(audioContext);
        
        stateRef.current = {
          audioContext,
          masterGain,
          windOscillator: null,
          windGain,
          clickBuffer,
          whooshBuffer,
          rattleBuffer,
          lastClickTime: 0,
        };
      } catch (error) {
        console.warn('Web Audio API not available:', error);
      }
    };
    
    // Initialize on first user interaction
    const handleInteraction = () => {
      if (!stateRef.current.audioContext) {
        initAudio();
      }
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
    
    window.addEventListener('click', handleInteraction);
    window.addEventListener('keydown', handleInteraction);
    
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      
      if (stateRef.current.audioContext) {
        stateRef.current.audioContext.close();
      }
    };
  }, []);
  
  // Update mute state
  useEffect(() => {
    if (stateRef.current.masterGain) {
      stateRef.current.masterGain.gain.value = isMuted ? 0 : 0.3;
    }
  }, [isMuted]);
  
  // Play one-shot sound
  const playSound = useCallback((buffer: AudioBuffer | null, volume: number = 1) => {
    if (!stateRef.current.audioContext || !stateRef.current.masterGain || !buffer || isMuted) {
      return;
    }
    
    const source = stateRef.current.audioContext.createBufferSource();
    source.buffer = buffer;
    
    const gain = stateRef.current.audioContext.createGain();
    gain.gain.value = volume;
    
    source.connect(gain);
    gain.connect(stateRef.current.masterGain);
    
    source.start();
  }, [isMuted]);
  
  // Update sounds based on ride state
  useEffect(() => {
    if (!stateRef.current.audioContext || !stateRef.current.windGain) return;
    
    const state = stateRef.current;
    const now = state.audioContext!.currentTime;
    
    if (isRiding) {
      // Wind volume based on speed
      const windVolume = Math.min(1, rideSpeed * 0.3);
      state.windGain!.gain.setTargetAtTime(windVolume, now, 0.1);
      
      // Chain lift clicks
      if (hasChainLift && rideProgress < 0.2) {
        const clickInterval = 0.15; // seconds between clicks
        if (now - state.lastClickTime > clickInterval) {
          playSound(state.clickBuffer, 0.3);
          state.lastClickTime = now;
        }
      }
      
      // Check if entering a loop
      if (loopSegments.length > 0 && trackPoints.length > 0) {
        const segments = trackPoints.length;
        const currentIndex = Math.floor(rideProgress * segments);
        const currentPoint = trackPoints[currentIndex];
        
        if (currentPoint?.hasLoop && !wasInLoopRef.current) {
          playSound(state.whooshBuffer, 0.5);
          wasInLoopRef.current = true;
        } else if (!currentPoint?.hasLoop) {
          wasInLoopRef.current = false;
        }
      }
      
      // Track rattling at high speeds
      if (rideSpeed > 1.5 && now - state.lastClickTime > 0.08) {
        if (Math.random() < 0.3) {
          playSound(state.rattleBuffer, rideSpeed * 0.1);
        }
      }
    } else {
      // Fade out wind when not riding
      state.windGain!.gain.setTargetAtTime(0, now, 0.3);
    }
    
    lastProgressRef.current = rideProgress;
  }, [isRiding, rideSpeed, rideProgress, hasChainLift, loopSegments, trackPoints, playSound]);
  
  // This component doesn't render anything visible
  return null;
}

// Hook for UI sound effects
export function useUISounds() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const { isMuted } = useAudio();
  
  const ensureContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);
  
  const playClick = useCallback(() => {
    if (isMuted) return;
    
    try {
      const ctx = ensureContext();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.value = 800;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.1);
    } catch (e) {
      // Ignore audio errors
    }
  }, [isMuted, ensureContext]);
  
  const playSuccess = useCallback(() => {
    if (isMuted) return;
    
    try {
      const ctx = ensureContext();
      const now = ctx.currentTime;
      
      [523, 659, 784].forEach((freq, i) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.value = freq;
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        
        const startTime = now + i * 0.1;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.1, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.2);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.2);
      });
    } catch (e) {
      // Ignore audio errors
    }
  }, [isMuted, ensureContext]);
  
  const playError = useCallback(() => {
    if (isMuted) return;
    
    try {
      const ctx = ensureContext();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = 200;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch (e) {
      // Ignore audio errors
    }
  }, [isMuted, ensureContext]);
  
  return { playClick, playSuccess, playError };
}
