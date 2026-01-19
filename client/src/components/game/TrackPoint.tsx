import { useRef, useEffect, useState } from "react";
import { ThreeEvent } from "@react-three/fiber";
import { TransformControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { useRollerCoaster } from "@/lib/stores/useRollerCoaster";

interface TrackPointProps {
  id: string;
  position: THREE.Vector3;
  tilt: number;
  index: number;
  isFirst?: boolean;
  isLast?: boolean;
}

export function TrackPoint({ id, position, tilt, index, isFirst, isLast }: TrackPointProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const transformRef = useRef<any>(null);
  const [meshReady, setMeshReady] = useState(false);
  const { selectedPointId, selectPoint, updateTrackPoint, updateTrackPointTilt, mode, setIsDraggingPoint } = useRollerCoaster();
  
  const isSelected = selectedPointId === id;
  
  useEffect(() => {
    if (meshRef.current) {
      setMeshReady(true);
    }
  }, []);
  
  useEffect(() => {
    if (!transformRef.current) return;
    
    const controls = transformRef.current;
    
    const handleDraggingChanged = (event: any) => {
      setIsDraggingPoint(event.value);
      
      if (!event.value && meshRef.current) {
        const worldPos = new THREE.Vector3();
        meshRef.current.getWorldPosition(worldPos);
        const clampedY = Math.max(0.5, worldPos.y);
        updateTrackPoint(id, new THREE.Vector3(worldPos.x, clampedY, worldPos.z));
      }
    };
    
    const handleObjectChange = () => {
      if (meshRef.current) {
        const worldPos = new THREE.Vector3();
        meshRef.current.getWorldPosition(worldPos);
        const clampedY = Math.max(0.5, worldPos.y);
        updateTrackPoint(id, new THREE.Vector3(worldPos.x, clampedY, worldPos.z));
      }
    };
    
    controls.addEventListener("dragging-changed", handleDraggingChanged);
    controls.addEventListener("objectChange", handleObjectChange);
    
    return () => {
      controls.removeEventListener("dragging-changed", handleDraggingChanged);
      controls.removeEventListener("objectChange", handleObjectChange);
    };
  }, [id, updateTrackPoint, setIsDraggingPoint, isSelected, meshReady]);
  
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (mode !== "build") return;
    e.stopPropagation();
    selectPoint(id);
  };
  
  const handleTiltChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTilt = parseFloat(e.target.value);
    updateTrackPointTilt(id, newTilt);
  };
  
  if (mode === "ride") return null;
  
  const POINT_SCALE = 0.6;
  
  // Dynamic colors based on state
  const getColor = () => {
    if (isSelected) return "#FF6B35";
    if (isFirst) return "#00E676";
    if (isLast) return "#FF1744";
    return "#448AFF";
  };
  
  const getEmissive = () => {
    if (isSelected) return "#FF3D00";
    if (isFirst) return "#00C853";
    if (isLast) return "#D50000";
    return "#2962FF";
  };
  
  return (
    <group>
      {/* Outer glow ring */}
      <mesh position={[position.x, position.y, position.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4 * POINT_SCALE, 0.55 * POINT_SCALE, 24]} />
        <meshBasicMaterial 
          color={getEmissive()} 
          transparent 
          opacity={isSelected ? 0.8 : 0.4} 
        />
      </mesh>
      
      {/* Main point sphere */}
      <mesh
        ref={meshRef}
        position={[position.x, position.y, position.z]}
        onClick={handleClick}
        castShadow
      >
        <sphereGeometry args={[0.4 * POINT_SCALE, 24, 24]} />
        <meshStandardMaterial
          color={getColor()}
          emissive={getEmissive()}
          emissiveIntensity={isSelected ? 0.6 : 0.3}
          metalness={0.5}
          roughness={0.3}
        />
      </mesh>
      
      {/* Point index label */}
      <Html position={[position.x, position.y + 0.8, position.z]} center distanceFactor={20}>
        <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-lg ${
          isSelected ? 'bg-orange-500 text-white' : 
          isFirst ? 'bg-green-500 text-white' : 
          isLast ? 'bg-red-500 text-white' : 
          'bg-blue-500/80 text-white'
        }`}>
          {index + 1}
        </div>
      </Html>
      
      {/* Vertical guide line to ground */}
      {position.y > 0.5 && (
        <mesh position={[position.x, position.y / 2, position.z]}>
          <cylinderGeometry args={[0.02, 0.02, position.y, 4]} />
          <meshBasicMaterial color={getColor()} transparent opacity={0.3} />
        </mesh>
      )}
      
      {isSelected && meshReady && meshRef.current && (
        <>
          <TransformControls
            ref={transformRef}
            object={meshRef.current}
            mode="translate"
            size={0.75}
            showX={true}
            showY={true}
            showZ={true}
          />
          
          <Html position={[position.x, position.y + 1.8, position.z]} center>
            <div 
              className="glass-panel text-white p-3 rounded-xl text-xs whitespace-nowrap shadow-2xl border border-orange-500/30"
              style={{ 
                pointerEvents: 'auto',
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9))',
                backdropFilter: 'blur(10px)'
              }}
            >
              <div className="text-[10px] text-slate-400 mb-2 font-semibold">Point {index + 1} Tilt</div>
              <div className="flex items-center gap-3">
                <span className="text-orange-400">↶</span>
                <input
                  type="range"
                  min="-45"
                  max="45"
                  step="5"
                  value={tilt}
                  onChange={handleTiltChange}
                  className="w-24 h-2 cursor-pointer"
                />
                <span className="text-orange-400">↷</span>
                <span className="w-10 text-center font-bold text-orange-400 bg-orange-500/20 px-2 py-1 rounded">{tilt}°</span>
              </div>
            </div>
          </Html>
        </>
      )}
    </group>
  );
}
