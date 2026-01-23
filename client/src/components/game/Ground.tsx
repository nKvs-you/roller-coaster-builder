import { useTexture, Instances, Instance } from "@react-three/drei";
import * as THREE from "three";
import { useMemo, useRef, memo, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useRollerCoaster } from "@/lib/stores/useRollerCoaster";

// Seeded random for consistent tree generation (prevents tweaking)
function seededRandom(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// Pre-computed tree data to prevent regeneration
interface TreeData {
  position: [number, number, number];
  trunkHeight: number;
  foliageRadius: number;
  rotation: number;
  scale: number;
}

// Memoized tree component with stable props - uses instanced meshes for performance
const Tree = memo(function Tree({ data, isNight }: { data: TreeData; isNight: boolean }) {
  const { position, trunkHeight, foliageRadius, rotation, scale } = data;
  
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      {/* Trunk */}
      <mesh position={[0, trunkHeight / 2, 0]} castShadow frustumCulled>
        <cylinderGeometry args={[0.15, 0.25, trunkHeight, 6]} />
        <meshStandardMaterial color="#5D4037" roughness={0.9} />
      </mesh>
      {/* Foliage layers */}
      <mesh position={[0, trunkHeight + foliageRadius * 0.3, 0]} castShadow frustumCulled>
        <coneGeometry args={[foliageRadius, foliageRadius * 2, 6]} />
        <meshStandardMaterial 
          color={isNight ? "#1a3d1a" : "#2E7D32"} 
          roughness={0.8}
        />
      </mesh>
      <mesh position={[0, trunkHeight + foliageRadius * 1.1, 0]} castShadow frustumCulled>
        <coneGeometry args={[foliageRadius * 0.7, foliageRadius * 1.5, 6]} />
        <meshStandardMaterial 
          color={isNight ? "#1e4d1e" : "#388E3C"} 
          roughness={0.8}
        />
      </mesh>
    </group>
  );
});

// Rock decoration
const Rock = memo(function Rock({ position, scale, rotation }: { 
  position: [number, number, number]; 
  scale: number; 
  rotation: number 
}) {
  return (
    <mesh position={position} rotation={[0, rotation, 0]} scale={scale} castShadow frustumCulled>
      <dodecahedronGeometry args={[0.8, 0]} />
      <meshStandardMaterial color="#6B7280" roughness={0.9} />
    </mesh>
  );
});

// Bench decoration
const Bench = memo(function Bench({ position, rotation }: { 
  position: [number, number, number]; 
  rotation: number 
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]} frustumCulled>
      {/* Seat */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[1.2, 0.08, 0.4]} />
        <meshStandardMaterial color="#8B4513" roughness={0.8} />
      </mesh>
      {/* Legs */}
      <mesh position={[-0.45, 0.175, 0]} castShadow>
        <boxGeometry args={[0.08, 0.35, 0.3]} />
        <meshStandardMaterial color="#4B3621" roughness={0.8} />
      </mesh>
      <mesh position={[0.45, 0.175, 0]} castShadow>
        <boxGeometry args={[0.08, 0.35, 0.3]} />
        <meshStandardMaterial color="#4B3621" roughness={0.8} />
      </mesh>
      {/* Backrest */}
      <mesh position={[0, 0.6, -0.15]} castShadow>
        <boxGeometry args={[1.2, 0.4, 0.06]} />
        <meshStandardMaterial color="#8B4513" roughness={0.8} />
      </mesh>
    </group>
  );
});

// Lamp post decoration
const LampPost = memo(function LampPost({ position, isNight }: { 
  position: [number, number, number]; 
  isNight: boolean 
}) {
  return (
    <group position={position} frustumCulled>
      {/* Pole */}
      <mesh position={[0, 2, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.08, 4, 8]} />
        <meshStandardMaterial color="#1F2937" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Lamp */}
      <mesh position={[0, 4.2, 0]}>
        <sphereGeometry args={[0.25, 8, 8]} />
        <meshBasicMaterial color={isNight ? "#FEF3C7" : "#F3F4F6"} />
      </mesh>
      {/* Light glow at night */}
      {isNight && (
        <pointLight position={[0, 4.2, 0]} color="#FEF3C7" intensity={1.5} distance={12} />
      )}
    </group>
  );
});

// Fountain decoration
const Fountain = memo(function Fountain({ position, isNight }: { 
  position: [number, number, number]; 
  isNight: boolean 
}) {
  return (
    <group position={position} frustumCulled>
      {/* Base pool */}
      <mesh position={[0, 0.15, 0]} receiveShadow>
        <cylinderGeometry args={[3, 3.2, 0.3, 16]} />
        <meshStandardMaterial color="#6B7280" roughness={0.6} />
      </mesh>
      {/* Water */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[2.8, 2.8, 0.1, 16]} />
        <meshStandardMaterial 
          color={isNight ? "#1E3A5F" : "#3B82F6"} 
          transparent 
          opacity={0.7}
          roughness={0.1}
        />
      </mesh>
      {/* Center pillar */}
      <mesh position={[0, 0.8, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.4, 1.3, 8]} />
        <meshStandardMaterial color="#9CA3AF" roughness={0.5} />
      </mesh>
      {/* Top bowl */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.8, 0.3, 0.3, 12]} />
        <meshStandardMaterial color="#6B7280" roughness={0.6} />
      </mesh>
    </group>
  );
});

// Flower bed
const FlowerBed = memo(function FlowerBed({ position, color, isNight }: { 
  position: [number, number, number]; 
  color: string;
  isNight: boolean 
}) {
  return (
    <group position={position} frustumCulled>
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <cylinderGeometry args={[1.2, 1.2, 0.2, 8]} />
        <meshStandardMaterial color="#5D4037" roughness={0.9} />
      </mesh>
      {/* Flowers in a circle */}
      {[0, 1, 2, 3, 4, 5].map(i => {
        const angle = (i / 6) * Math.PI * 2;
        const r = 0.7;
        return (
          <group key={i} position={[Math.cos(angle) * r, 0.35, Math.sin(angle) * r]}>
            <mesh castShadow>
              <sphereGeometry args={[0.15, 6, 6]} />
              <meshBasicMaterial color={isNight ? "#666" : color} />
            </mesh>
            <mesh position={[0, -0.15, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 0.2, 4]} />
              <meshStandardMaterial color={isNight ? "#1a3d1a" : "#22C55E"} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
});

// Path/walkway - memoized
const Walkway = memo(function Walkway() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow frustumCulled>
      <ringGeometry args={[15, 25, 32]} />
      <meshStandardMaterial color="#9E9E9E" roughness={0.8} />
    </mesh>
  );
});

export const Ground = memo(function Ground() {
  const basePath = import.meta.env.BASE_URL || '/';
  const texture = useTexture(`${basePath}textures/grass.png`);
  const isNightMode = useRollerCoaster(s => s.isNightMode);
  
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(200, 200);
  
  // Generate STABLE tree positions using seeded random (prevents tweaking)
  const trees = useMemo((): TreeData[] => {
    const positions: TreeData[] = [];
    for (let i = 0; i < 80; i++) {
      const seed = i * 1337;
      const angle = seededRandom(seed) * Math.PI * 2;
      const radius = 60 + seededRandom(seed + 1) * 240;
      positions.push({
        position: [
          Math.cos(angle) * radius,
          0,
          Math.sin(angle) * radius
        ],
        trunkHeight: 2 + seededRandom(seed + 2) * 2,
        foliageRadius: 1.5 + seededRandom(seed + 3) * 1,
        rotation: seededRandom(seed + 4) * Math.PI * 2,
        scale: 0.8 + seededRandom(seed + 5) * 0.4
      });
    }
    return positions;
  }, []); // Empty deps - only generate once
  
  // Generate STABLE rock positions
  const rocks = useMemo(() => {
    const positions: { pos: [number, number, number]; scale: number; rotation: number }[] = [];
    for (let i = 0; i < 40; i++) {
      const seed = (i + 1000) * 1337;
      const angle = seededRandom(seed) * Math.PI * 2;
      const radius = 40 + seededRandom(seed + 1) * 180;
      positions.push({
        pos: [Math.cos(angle) * radius, 0.3, Math.sin(angle) * radius],
        scale: 0.5 + seededRandom(seed + 2) * 0.8,
        rotation: seededRandom(seed + 3) * Math.PI * 2
      });
    }
    return positions;
  }, []);
  
  // Generate STABLE bench positions
  const benches = useMemo(() => {
    const positions: { pos: [number, number, number]; rotation: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const radius = 20;
      positions.push({
        pos: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
        rotation: angle + Math.PI / 2
      });
    }
    return positions;
  }, []);
  
  // Generate STABLE lamp post positions
  const lampPosts = useMemo(() => {
    const positions: [number, number, number][] = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = 22;
      positions.push([Math.cos(angle) * radius, 0, Math.sin(angle) * radius]);
    }
    return positions;
  }, []);
  
  // Generate STABLE flower bed positions
  const flowerBeds = useMemo(() => {
    const colors = ["#E91E63", "#FF9800", "#FFEB3B", "#9C27B0", "#00BCD4", "#F44336"];
    const positions: { pos: [number, number, number]; color: string }[] = [];
    for (let i = 0; i < 18; i++) {
      const seed = (i + 2000) * 1337;
      const angle = seededRandom(seed) * Math.PI * 2;
      const radius = 28 + seededRandom(seed + 1) * 60;
      positions.push({
        pos: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
        color: colors[Math.floor(seededRandom(seed + 2) * colors.length)]
      });
    }
    return positions;
  }, []);
  
  return (
    <group>
      {/* Main ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow frustumCulled>
        <planeGeometry args={[800, 800]} />
        <meshStandardMaterial 
          map={texture} 
          color={isNightMode ? "#1a2a1a" : "#4CAF50"}
          roughness={0.9}
        />
      </mesh>
      
      {/* Central plaza area */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow frustumCulled>
        <circleGeometry args={[12, 32]} />
        <meshStandardMaterial color={isNightMode ? "#333344" : "#795548"} roughness={0.7} />
      </mesh>
      
      {/* Walkway */}
      <Walkway />
      
      {/* Central fountain */}
      <Fountain position={[0, 0, 0]} isNight={isNightMode} />
      
      {/* Trees - stable positions */}
      {trees.map((data, i) => (
        <Tree key={`tree-${i}`} data={data} isNight={isNightMode} />
      ))}
      
      {/* Rocks */}
      {rocks.map((rock, i) => (
        <Rock key={`rock-${i}`} position={rock.pos} scale={rock.scale} rotation={rock.rotation} />
      ))}
      
      {/* Benches around the plaza */}
      {benches.map((bench, i) => (
        <Bench key={`bench-${i}`} position={bench.pos} rotation={bench.rotation} />
      ))}
      
      {/* Lamp posts */}
      {lampPosts.map((pos, i) => (
        <LampPost key={`lamp-${i}`} position={pos} isNight={isNightMode} />
      ))}
      
      {/* Flower beds */}
      {!isNightMode && flowerBeds.map((bed, i) => (
        <FlowerBed key={`flower-${i}`} position={bed.pos} color={bed.color} isNight={isNightMode} />
      ))}
      
      {/* Paths radiating from center */}
      {[0, 1, 2, 3].map(i => {
        const angle = (i / 4) * Math.PI * 2;
        return (
          <mesh 
            key={`path-${i}`}
            rotation={[-Math.PI / 2, 0, angle]} 
            position={[Math.cos(angle) * 45, 0.015, Math.sin(angle) * 45]} 
            receiveShadow
            frustumCulled
          >
            <planeGeometry args={[4, 60]} />
            <meshStandardMaterial color={isNightMode ? "#444455" : "#B0BEC5"} roughness={0.8} />
          </mesh>
        );
      })}
    </group>
  );
});
