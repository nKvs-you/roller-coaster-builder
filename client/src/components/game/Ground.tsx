import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useRollerCoaster } from "@/lib/stores/useRollerCoaster";

// Decorative tree component
function Tree({ position }: { position: [number, number, number] }) {
  const trunkHeight = 2 + Math.random() * 2;
  const foliageRadius = 1.5 + Math.random() * 1;
  const isNight = useRollerCoaster(s => s.isNightMode);
  
  return (
    <group position={position}>
      {/* Trunk */}
      <mesh position={[0, trunkHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.25, trunkHeight, 8]} />
        <meshStandardMaterial color="#5D4037" roughness={0.9} />
      </mesh>
      {/* Foliage layers */}
      <mesh position={[0, trunkHeight + foliageRadius * 0.3, 0]} castShadow>
        <coneGeometry args={[foliageRadius, foliageRadius * 2, 8]} />
        <meshStandardMaterial 
          color={isNight ? "#1a3d1a" : "#2E7D32"} 
          roughness={0.8}
        />
      </mesh>
      <mesh position={[0, trunkHeight + foliageRadius * 1.1, 0]} castShadow>
        <coneGeometry args={[foliageRadius * 0.7, foliageRadius * 1.5, 8]} />
        <meshStandardMaterial 
          color={isNight ? "#1e4d1e" : "#388E3C"} 
          roughness={0.8}
        />
      </mesh>
    </group>
  );
}

// Decorative flower/bush
function Bush({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <sphereGeometry args={[0.4, 8, 8]} />
        <meshStandardMaterial color="#2E7D32" roughness={0.9} />
      </mesh>
      {/* Flowers */}
      {[0, 1, 2, 3, 4].map(i => {
        const angle = (i / 5) * Math.PI * 2;
        const r = 0.25;
        return (
          <mesh key={i} position={[Math.cos(angle) * r, 0.3, Math.sin(angle) * r]}>
            <sphereGeometry args={[0.1, 6, 6]} />
            <meshBasicMaterial color={color} />
          </mesh>
        );
      })}
    </group>
  );
}

// Path/walkway
function Walkway() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
      <ringGeometry args={[15, 25, 32]} />
      <meshStandardMaterial color="#9E9E9E" roughness={0.8} />
    </mesh>
  );
}

export function Ground() {
  const basePath = import.meta.env.BASE_URL || '/';
  const texture = useTexture(`${basePath}textures/grass.png`);
  const isNightMode = useRollerCoaster(s => s.isNightMode);
  
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(200, 200);
  
  // Generate random tree positions
  const trees = useMemo(() => {
    const positions: [number, number, number][] = [];
    for (let i = 0; i < 60; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 80 + Math.random() * 200;
      positions.push([
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      ]);
    }
    return positions;
  }, []);
  
  // Generate random bush positions
  const bushes = useMemo(() => {
    const positions: { pos: [number, number, number]; color: string }[] = [];
    const colors = ["#E91E63", "#FF9800", "#FFEB3B", "#9C27B0", "#00BCD4"];
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 30 + Math.random() * 100;
      positions.push({
        pos: [Math.cos(angle) * radius, 0.2, Math.sin(angle) * radius],
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
    return positions;
  }, []);
  
  return (
    <group>
      {/* Main ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[800, 800]} />
        <meshStandardMaterial 
          map={texture} 
          color={isNightMode ? "#1a2a1a" : "#4CAF50"}
          roughness={0.9}
        />
      </mesh>
      
      {/* Central plaza area */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <circleGeometry args={[12, 32]} />
        <meshStandardMaterial color={isNightMode ? "#333344" : "#795548"} roughness={0.7} />
      </mesh>
      
      {/* Walkway */}
      <Walkway />
      
      {/* Decorative elements */}
      {trees.map((pos, i) => (
        <Tree key={`tree-${i}`} position={pos} />
      ))}
      
      {!isNightMode && bushes.map((bush, i) => (
        <Bush key={`bush-${i}`} position={bush.pos} color={bush.color} />
      ))}
    </group>
  );
}
