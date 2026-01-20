import { create } from "zustand";

interface AudioState {
  backgroundMusic: HTMLAudioElement | null;
  daylightMusic: HTMLAudioElement | null;
  nightMusic: HTMLAudioElement | null;
  hitSound: HTMLAudioElement | null;
  successSound: HTMLAudioElement | null;
  isMuted: boolean;
  isDaylightMusicPlaying: boolean;
  isNightMusicPlaying: boolean;
  
  // Setter functions
  setBackgroundMusic: (music: HTMLAudioElement) => void;
  setDaylightMusic: (music: HTMLAudioElement) => void;
  setNightMusic: (music: HTMLAudioElement) => void;
  setHitSound: (sound: HTMLAudioElement) => void;
  setSuccessSound: (sound: HTMLAudioElement) => void;
  
  // Control functions
  toggleMute: () => void;
  playHit: () => void;
  playSuccess: () => void;
  playDaylightMusic: () => void;
  stopDaylightMusic: () => void;
  playNightMusic: () => void;
  stopNightMusic: () => void;
}

export const useAudio = create<AudioState>((set, get) => ({
  backgroundMusic: null,
  daylightMusic: null,
  nightMusic: null,
  hitSound: null,
  successSound: null,
  isMuted: false,
  isDaylightMusicPlaying: false,
  isNightMusicPlaying: false,
  
  setBackgroundMusic: (music) => set({ backgroundMusic: music }),
  setDaylightMusic: (music) => set({ daylightMusic: music }),
  setNightMusic: (music) => set({ nightMusic: music }),
  setHitSound: (sound) => set({ hitSound: sound }),
  setSuccessSound: (sound) => set({ successSound: sound }),
  
  toggleMute: () => {
    const { isMuted } = get();
    const newMutedState = !isMuted;
    
    // Just update the muted state
    set({ isMuted: newMutedState });
  },
  
  playHit: () => {
    const { hitSound, isMuted } = get();
    if (hitSound) {
      // If sound is muted, don't play anything
      if (isMuted) {
        return;
      }
      
      // Clone the sound to allow overlapping playback
      const soundClone = hitSound.cloneNode() as HTMLAudioElement;
      soundClone.volume = 0.3;
      soundClone.play().catch(() => {
        // Audio play prevented by browser policy - this is expected
      });
    }
  },
  
  playSuccess: () => {
    const { successSound, isMuted } = get();
    if (successSound) {
      // If sound is muted, don't play anything
      if (isMuted) {
        return;
      }
      
      successSound.currentTime = 0;
      successSound.play().catch(() => {
        // Audio play prevented by browser policy - this is expected
      });
    }
  },
  
  playDaylightMusic: () => {
    const { daylightMusic, isMuted, isDaylightMusicPlaying } = get();
    if (daylightMusic && !isDaylightMusicPlaying) {
      daylightMusic.loop = true;
      daylightMusic.volume = 0.5;
      
      if (!isMuted) {
        daylightMusic.play().catch(() => {});
      }
      set({ isDaylightMusicPlaying: true });
    }
  },
  
  stopDaylightMusic: () => {
    const { daylightMusic } = get();
    if (daylightMusic) {
      daylightMusic.pause();
      daylightMusic.currentTime = 0;
      set({ isDaylightMusicPlaying: false });
    }
  },
  
  playNightMusic: () => {
    const { nightMusic, isMuted, isNightMusicPlaying } = get();
    if (nightMusic && !isNightMusicPlaying) {
      nightMusic.loop = true;
      nightMusic.volume = 0.5;
      
      if (!isMuted) {
        nightMusic.play().catch(() => {});
      }
      set({ isNightMusicPlaying: true });
    }
  },
  
  stopNightMusic: () => {
    const { nightMusic } = get();
    if (nightMusic) {
      nightMusic.pause();
      nightMusic.currentTime = 0;
      set({ isNightMusicPlaying: false });
    }
  }
}));
