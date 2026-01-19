/**
 * ParticleEffects Component
 * 
 * Game-like particle effects for the roller coaster:
 * - Sparks on rails
 * - Wind trails
 * - Speed streaks
 * - Loop confetti
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useRollerCoaster } from "@/lib/stores/useRollerCoaster";
import { getTrackCurve } from "./Track";

const PARTICLE_COUNT = 200;
const SPARK_COUNT = 50;
const TRAIL_LENGTH = 30;

// Spark particles - appear when car is moving fast
function SparkParticles({ carPosition, speed }: { carPosition: THREE.Vector3; speed: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const velocitiesRef = useRef<Float32Array | null>(null);
  const lifetimesRef = useRef<Float32Array | null>(null);
  
  const { positions, colors, velocities, lifetimes } = useMemo(() => {
    const positions = new Float32Array(SPARK_COUNT * 3);
    const colors = new Float32Array(SPARK_COUNT * 3);
    const velocities = new Float32Array(SPARK_COUNT * 3);
    const lifetimes = new Float32Array(SPARK_COUNT);
    
    // Initialize all particles as dead
    for (let i = 0; i < SPARK_COUNT; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -1000; // Off-screen
      positions[i * 3 + 2] = 0;
      lifetimes[i] = 0;
    }
    
    return { positions, colors, velocities, lifetimes };
  }, []);
  
  // Store refs for animation
  if (!velocitiesRef.current) velocitiesRef.current = velocities;
  if (!lifetimesRef.current) lifetimesRef.current = lifetimes;
  
  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    
    const posArray = pointsRef.current.geometry.attributes.position.array as Float32Array;
    const colorArray = pointsRef.current.geometry.attributes.color.array as Float32Array;
    const vels = velocitiesRef.current!;
    const lives = lifetimesRef.current!;
    
    // Only spawn sparks if moving fast
    const shouldSpawn = speed > 5;
    
    for (let i = 0; i < SPARK_COUNT; i++) {
      lives[i] -= delta;
      
      // Respawn dead particles
      if (lives[i] <= 0 && shouldSpawn && Math.random() < 0.3) {
        // Spawn near car
        posArray[i * 3] = carPosition.x + (Math.random() - 0.5) * 0.5;
        posArray[i * 3 + 1] = carPosition.y - 0.3;
        posArray[i * 3 + 2] = carPosition.z + (Math.random() - 0.5) * 0.5;
        
        // Random velocity
        vels[i * 3] = (Math.random() - 0.5) * 3;
        vels[i * 3 + 1] = Math.random() * 2 - 0.5;
        vels[i * 3 + 2] = (Math.random() - 0.5) * 3;
        
        // Lifetime based on speed
        lives[i] = 0.3 + Math.random() * 0.4;
        
        // Orange/yellow spark color
        colorArray[i * 3] = 1;
        colorArray[i * 3 + 1] = 0.5 + Math.random() * 0.5;
        colorArray[i * 3 + 2] = 0;
      }
      
      // Update alive particles
      if (lives[i] > 0) {
        posArray[i * 3] += vels[i * 3] * delta;
        posArray[i * 3 + 1] += vels[i * 3 + 1] * delta;
        posArray[i * 3 + 2] += vels[i * 3 + 2] * delta;
        
        // Gravity
        vels[i * 3 + 1] -= 9.8 * delta;
        
        // Fade out
        const alpha = lives[i] / 0.7;
        colorArray[i * 3 + 2] = 0.2 * alpha;
      } else {
        posArray[i * 3 + 1] = -1000;
      }
    }
    
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
    pointsRef.current.geometry.attributes.color.needsUpdate = true;
  });
  
  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={SPARK_COUNT}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={SPARK_COUNT}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.1}
        vertexColors
        transparent
        opacity={0.8}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// Wind trail - lines following the car
function WindTrail({ carPosition, speed, tangent }: { 
  carPosition: THREE.Vector3; 
  speed: number;
  tangent: THREE.Vector3;
}) {
  const lineRef = useRef<THREE.Line>(null);
  const historyRef = useRef<THREE.Vector3[]>([]);
  
  const { positions } = useMemo(() => {
    const positions = new Float32Array(TRAIL_LENGTH * 3);
    return { positions };
  }, []);
  
  useFrame(() => {
    if (!lineRef.current) return;
    
    // Only show trail when moving fast
    if (speed < 3) {
      historyRef.current = [];
      return;
    }
    
    // Add current position to history
    historyRef.current.unshift(carPosition.clone());
    
    // Limit history length
    if (historyRef.current.length > TRAIL_LENGTH) {
      historyRef.current.pop();
    }
    
    const posArray = lineRef.current.geometry.attributes.position.array as Float32Array;
    
    // Update line positions
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      if (i < historyRef.current.length) {
        const pos = historyRef.current[i];
        posArray[i * 3] = pos.x;
        posArray[i * 3 + 1] = pos.y;
        posArray[i * 3 + 2] = pos.z;
      } else {
        // Hide unused points
        posArray[i * 3] = carPosition.x;
        posArray[i * 3 + 1] = carPosition.y;
        posArray[i * 3 + 2] = carPosition.z;
      }
    }
    
    lineRef.current.geometry.attributes.position.needsUpdate = true;
  });
  
  return (
    <primitive object={new THREE.Line()} ref={lineRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={TRAIL_LENGTH}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial 
        color="#38bdf8" 
        transparent 
        opacity={0.4} 
        linewidth={2}
        blending={THREE.AdditiveBlending}
      />
    </primitive>
  );
}

// Speed lines - streaking lines in the direction of motion
function SpeedLines({ carPosition, speed, tangent }: {
  carPosition: THREE.Vector3;
  speed: number;
  tangent: THREE.Vector3;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const linesRef = useRef<Array<{ mesh: THREE.Mesh; offset: THREE.Vector3; phase: number }>>([]);
  
  // Create line meshes
  useMemo(() => {
    linesRef.current = [];
    for (let i = 0; i < 20; i++) {
      linesRef.current.push({
        mesh: null as any,
        offset: new THREE.Vector3(
          (Math.random() - 0.5) * 4,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 4
        ),
        phase: Math.random() * Math.PI * 2,
      });
    }
  }, []);
  
  useFrame((state) => {
    if (!groupRef.current) return;
    
    // Only show at high speeds
    const visible = speed > 8;
    groupRef.current.visible = visible;
    
    if (!visible) return;
    
    const time = state.clock.elapsedTime;
    
    groupRef.current.children.forEach((child, i) => {
      if (i >= linesRef.current.length) return;
      
      const lineData = linesRef.current[i];
      const mesh = child as THREE.Mesh;
      
      // Animate position
      const phase = lineData.phase + time * 5;
      const z = ((phase % 6) - 3) * (speed * 0.5);
      
      mesh.position.copy(carPosition)
        .add(lineData.offset)
        .addScaledVector(tangent, z);
      
      // Fade based on position
      const fade = 1 - Math.abs(z) / (speed * 1.5);
      (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, fade * 0.5);
      
      // Scale based on speed
      mesh.scale.set(0.02, 0.02, 0.1 + speed * 0.02);
      mesh.lookAt(carPosition.clone().add(tangent));
    });
  });
  
  return (
    <group ref={groupRef}>
      {Array.from({ length: 20 }).map((_, i) => (
        <mesh key={i}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial 
            color="#ffffff" 
            transparent 
            opacity={0.3}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// Main particle effects component
export function ParticleEffects() {
  const { trackPoints, rideProgress, isRiding, isLooped, rideSpeed } = useRollerCoaster();
  
  const { carPosition, tangent, speed } = useMemo(() => {
    if (trackPoints.length < 2 || !isRiding) {
      return {
        carPosition: new THREE.Vector3(0, -1000, 0),
        tangent: new THREE.Vector3(0, 0, 1),
        speed: 0,
      };
    }
    
    const curve = getTrackCurve(trackPoints, isLooped);
    if (!curve) {
      return {
        carPosition: new THREE.Vector3(0, -1000, 0),
        tangent: new THREE.Vector3(0, 0, 1),
        speed: 0,
      };
    }
    
    const t = Math.max(0, Math.min(0.9999, rideProgress));
    const carPosition = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    
    return { carPosition, tangent, speed: rideSpeed * 5 };
  }, [trackPoints, rideProgress, isRiding, isLooped, rideSpeed]);
  
  if (!isRiding || trackPoints.length < 2) return null;
  
  return (
    <group>
      <SparkParticles carPosition={carPosition} speed={speed} />
      <WindTrail carPosition={carPosition} speed={speed} tangent={tangent} />
      <SpeedLines carPosition={carPosition} speed={speed} tangent={tangent} />
    </group>
  );
}
