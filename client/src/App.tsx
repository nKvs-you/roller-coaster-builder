import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import "@fontsource/inter";
import { Ground } from "./components/game/Ground";
import { TrackBuilder } from "./components/game/TrackBuilder";
import { BuildCamera } from "./components/game/BuildCamera";
import { RideCamera } from "./components/game/RideCamera";
import { Sky } from "./components/game/Sky";
import { GameUI } from "./components/game/GameUI";
import { GForceDisplay } from "./components/game/GForceDisplay";
import { ParticleEffects } from "./components/game/ParticleEffects";
import { EditorGizmos } from "./components/game/EditorGizmos";
import { SoundEffects } from "./components/game/SoundEffects";
import { PhysicsDebugOverlay } from "./components/game/PhysicsDebugOverlay";
import { useRollerCoaster } from "./lib/stores/useRollerCoaster";
import { useAudio } from "./lib/stores/useAudio";
import { ErrorBoundary, Canvas3DErrorFallback } from "./components/ErrorBoundary";
import { loadPhysicsEngine } from "./lib/wasm/physicsEngine";

function MusicController() {
  const { isNightMode } = useRollerCoaster();
  const { 
    setDaylightMusic, daylightMusic,
    setNightMusic, nightMusic,
    isMuted 
  } = useAudio();
  const hasStartedRef = useRef(false);
  
  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/';
    
    const dayMusic = new Audio(`${base}sounds/menuloop.mp3`);
    dayMusic.loop = true;
    dayMusic.volume = 0.5;
    setDaylightMusic(dayMusic);
    
    const nightMusicAudio = new Audio(`${base}sounds/menuloop.mp3`);
    nightMusicAudio.loop = true;
    nightMusicAudio.volume = 0.5;
    setNightMusic(nightMusicAudio);
    
    return () => {
      dayMusic.pause();
      dayMusic.src = "";
      nightMusicAudio.pause();
      nightMusicAudio.src = "";
    };
  }, [setDaylightMusic, setNightMusic]);
  
  useEffect(() => {
    const startMusicOnInteraction = () => {
      if (hasStartedRef.current) return;
      hasStartedRef.current = true;
      
      if (!isMuted) {
        if (isNightMode && nightMusic) {
          nightMusic.play().catch(() => {});
        } else if (!isNightMode && daylightMusic) {
          daylightMusic.play().catch(() => {});
        }
      }
      
      document.removeEventListener('click', startMusicOnInteraction);
      document.removeEventListener('keydown', startMusicOnInteraction);
    };
    
    document.addEventListener('click', startMusicOnInteraction);
    document.addEventListener('keydown', startMusicOnInteraction);
    
    return () => {
      document.removeEventListener('click', startMusicOnInteraction);
      document.removeEventListener('keydown', startMusicOnInteraction);
    };
  }, [daylightMusic, nightMusic, isNightMode, isMuted]);
  
  useEffect(() => {
    if (!daylightMusic || !nightMusic || !hasStartedRef.current) return;
    
    if (isNightMode) {
      daylightMusic.pause();
      nightMusic.currentTime = 0;
      if (!isMuted) nightMusic.play().catch(() => {});
    } else {
      nightMusic.pause();
      daylightMusic.currentTime = 0;
      if (!isMuted) daylightMusic.play().catch(() => {});
    }
  }, [isNightMode, daylightMusic, nightMusic, isMuted]);
  
  useEffect(() => {
    if (!hasStartedRef.current) return;
    
    if (isMuted) {
      if (daylightMusic) daylightMusic.pause();
      if (nightMusic) nightMusic.pause();
    } else {
      if (isNightMode && nightMusic) {
        nightMusic.play().catch(() => {});
      } else if (!isNightMode && daylightMusic) {
        daylightMusic.play().catch(() => {});
      }
    }
  }, [isMuted, daylightMusic, nightMusic, isNightMode]);
  
  return null;
}

function Scene() {
  const { mode } = useRollerCoaster();
  const [showDebug, setShowDebug] = useState(false);
  
  // Toggle debug with keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        setShowDebug(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  return (
    <>
      <Sky />
      <BuildCamera />
      <RideCamera />
      
      <Suspense fallback={null}>
        <Ground />
        <TrackBuilder />
        
        {/* Game-like effects */}
        <ParticleEffects />
        
        {/* Editor gizmos for professional editing */}
        <EditorGizmos />
        
        {/* Physics debug overlay (toggle with F3) */}
        {showDebug && (
          <PhysicsDebugOverlay 
            showVelocity={true}
            showForces={true}
            showBounds={true}
            showGForceHeatmap={true}
          />
        )}
      </Suspense>
    </>
  );
}

function App() {
  // Try to load WASM physics engine on startup
  useEffect(() => {
    loadPhysicsEngine().catch(() => {
      console.log('Using JavaScript physics fallback');
    });
  }, []);
  
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <MusicController />
      <SoundEffects />
      <ErrorBoundary fallback={<Canvas3DErrorFallback />}>
        <Canvas
          shadows
          camera={{
            position: [20, 15, 20],
            fov: 60,
            near: 0.1,
            far: 1000
          }}
          gl={{
            antialias: true,
            powerPreference: "default"
          }}
        >
          <Scene />
        </Canvas>
      </ErrorBoundary>
      <GameUI />
      <GForceDisplay />
    </div>
  );
}

export default App;
