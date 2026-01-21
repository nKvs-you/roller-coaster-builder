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
import { Canvas2DRideView } from "./components/game/Canvas2DRideView";
import { Canvas2DEditor } from "./components/game/Canvas2DEditor";
import { useRollerCoaster } from "./lib/stores/useRollerCoaster";
import { useAudio } from "./lib/stores/useAudio";
import { ErrorBoundary, Canvas3DErrorFallback } from "./components/ErrorBoundary";
import { detectWebGL } from "./lib/webglDetect";
// Physics engine is now pure JavaScript - no WASM required

function MusicController() {
  const { isNightMode } = useRollerCoaster();
  const { 
    setNightMusic, nightMusic,
    isMuted 
  } = useAudio();
  const hasStartedRef = useRef(false);
  
  // Only load and play music during night mode
  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/';
    
    const nightMusicAudio = new Audio(`${base}sounds/menuloop.mp3`);
    nightMusicAudio.loop = true;
    nightMusicAudio.volume = 0.4;
    setNightMusic(nightMusicAudio);
    
    return () => {
      nightMusicAudio.pause();
      nightMusicAudio.src = "";
    };
  }, [setNightMusic]);
  
  // Start music on first interaction (only plays in night mode)
  useEffect(() => {
    const startMusicOnInteraction = () => {
      if (hasStartedRef.current) return;
      hasStartedRef.current = true;
      
      // Only play if in night mode
      if (!isMuted && isNightMode && nightMusic) {
        nightMusic.play().catch(() => {});
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
  }, [nightMusic, isNightMode, isMuted]);
  
  // Handle night mode toggle - music only plays at night
  useEffect(() => {
    if (!nightMusic || !hasStartedRef.current) return;
    
    if (isNightMode && !isMuted) {
      nightMusic.currentTime = 0;
      nightMusic.play().catch(() => {});
    } else {
      nightMusic.pause();
    }
  }, [isNightMode, nightMusic, isMuted]);
  
  // Handle mute toggle
  useEffect(() => {
    if (!hasStartedRef.current || !nightMusic) return;
    
    if (isMuted || !isNightMode) {
      nightMusic.pause();
    } else if (isNightMode) {
      nightMusic.play().catch(() => {});
    }
  }, [isMuted, nightMusic, isNightMode]);
  
  return null;
}

function Scene() {
  const { mode, showDebugOverlay, setShowDebugOverlay } = useRollerCoaster();
  
  // Toggle debug with keyboard (F3)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        setShowDebugOverlay(!showDebugOverlay);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDebugOverlay, setShowDebugOverlay]);
  
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
        
        {/* Physics debug overlay (toggle with F3 or from Debug menu) */}
        {showDebugOverlay && (
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
  // Check WebGL support
  const [webglSupported, setWebglSupported] = useState(true);
  const [use2DMode, setUse2DMode] = useState(false);
  const { isRiding, mode } = useRollerCoaster();
  
  useEffect(() => {
    const support = detectWebGL();
    setWebglSupported(support.supported);
    if (!support.supported) {
      console.log('WebGL not available, using 2D mode for everything');
      setUse2DMode(true);
    }
  }, []);
  
  // Handle keyboard shortcut for 2D mode toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Press F2 to toggle 2D mode
      if (e.key === 'F2') {
        e.preventDefault();
        setUse2DMode(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  // Show 2D ride view when riding in 2D mode or when WebGL is unavailable
  const show2DRide = isRiding && (use2DMode || !webglSupported);
  // Use 2D editor when WebGL is unavailable or 2D mode is selected
  const use2DEditor = use2DMode || !webglSupported;
  
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <MusicController />
      <SoundEffects />
      
      {/* 2D Ride View (works without WebGL) */}
      {show2DRide && (
        <Canvas2DRideView onExit={() => {}} />
      )}
      
      {/* 2D Editor (works without WebGL) */}
      {use2DEditor && !isRiding && (
        <Canvas2DEditor />
      )}
      
      {/* 3D View (requires WebGL) - only when WebGL is available and 2D mode is off */}
      {webglSupported && !use2DMode && !isRiding && (
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
      )}
      
      {/* 3D Ride (when not using 2D) */}
      {webglSupported && !use2DMode && isRiding && (
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
      )}
      
      {/* UI Overlays - always show */}
      <GameUI use2DMode={use2DMode} onToggle2DMode={() => setUse2DMode(prev => !prev)} />
      {!use2DMode && webglSupported && <GForceDisplay />}
      
      {/* 2D Mode indicator */}
      {use2DMode && !isRiding && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-purple-500/80 text-white px-4 py-2 rounded-lg text-sm font-bold z-50">
          2D Mode {webglSupported ? '(Press F2 to toggle 3D)' : '(WebGL unavailable)'}
        </div>
      )}
    </div>
  );
}

export default App;
