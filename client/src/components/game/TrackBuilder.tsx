import { useRef, useState, useEffect } from "react";
import { ThreeEvent, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useRollerCoaster } from "@/lib/stores/useRollerCoaster";
import { TrackPoint } from "./TrackPoint";
import { Track } from "./Track";
import { Grid } from "@react-three/drei";

export function TrackBuilder() {
  const { trackPoints, addTrackPoint, mode, selectPoint, isAddingPoints, snapToGrid, gridSize } = useRollerCoaster();
  const planeRef = useRef<THREE.Mesh>(null);
  const { gl } = useThree();
  
  const [isDraggingNew, setIsDraggingNew] = useState(false);
  const [dragPosition, setDragPosition] = useState<THREE.Vector3 | null>(null);
  const currentHeightRef = useRef(3);
  
  useEffect(() => {
    if (!isDraggingNew) return;
    
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingNew || !dragPosition) return;
      
      const deltaY = e.movementY * -0.1;
      const newHeight = Math.max(0.5, Math.min(50, currentHeightRef.current + deltaY));
      currentHeightRef.current = newHeight;
      
      setDragPosition(new THREE.Vector3(dragPosition.x, newHeight, dragPosition.z));
    };
    
    const handlePointerUp = () => {
      if (isDraggingNew && dragPosition) {
        const finalPoint = new THREE.Vector3(dragPosition.x, currentHeightRef.current, dragPosition.z);
        addTrackPoint(finalPoint);
      }
      
      setIsDraggingNew(false);
      setDragPosition(null);
      currentHeightRef.current = 3;
    };
    
    gl.domElement.addEventListener("pointermove", handlePointerMove);
    gl.domElement.addEventListener("pointerup", handlePointerUp);
    
    return () => {
      gl.domElement.removeEventListener("pointermove", handlePointerMove);
      gl.domElement.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isDraggingNew, dragPosition, addTrackPoint, gl.domElement]);
  
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    // Only build track on left-click (button 0), not right-click (button 2) or middle-click (button 1)
    if (e.button !== 0) return;
    if (mode !== "build" || !isAddingPoints) return;
    e.stopPropagation();
    
    selectPoint(null);
    
    currentHeightRef.current = 3;
    const point = new THREE.Vector3(e.point.x, 3, e.point.z);
    
    setDragPosition(point);
    setIsDraggingNew(true);
  };
  
  return (
    <group>
      {/* Visual grid when snap-to-grid is enabled */}
      {snapToGrid && mode === "build" && (
        <Grid
          args={[200, 200]}
          cellSize={gridSize}
          cellThickness={0.5}
          cellColor="#4a5568"
          sectionSize={gridSize * 5}
          sectionThickness={1}
          sectionColor="#718096"
          fadeDistance={100}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid={true}
          position={[0, 0.02, 0]}
        />
      )}
      
      <mesh
        ref={planeRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, 0]}
        onPointerDown={handlePointerDown}
        visible={false}
      >
        <planeGeometry args={[800, 800]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      
      <Track />
      
      {trackPoints.map((point, index) => (
        <TrackPoint
          key={point.id}
          id={point.id}
          position={point.position}
          tilt={point.tilt}
          index={index}
          isFirst={index === 0}
          isLast={index === trackPoints.length - 1}
        />
      ))}
      
      {isDraggingNew && dragPosition && (
        <group>
          <mesh position={[dragPosition.x, dragPosition.y, dragPosition.z]}>
            <sphereGeometry args={[0.3, 16, 16]} />
            <meshStandardMaterial color="#00ff00" transparent opacity={0.7} />
          </mesh>
          <mesh position={[dragPosition.x, dragPosition.y / 2, dragPosition.z]}>
            <cylinderGeometry args={[0.03, 0.03, dragPosition.y, 8]} />
            <meshStandardMaterial color="#00ff00" transparent opacity={0.5} />
          </mesh>
        </group>
      )}
    </group>
  );
}
