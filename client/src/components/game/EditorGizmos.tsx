/**
 * EditorGizmos Component
 * 
 * 3D transform gizmos for professional track point editing:
 * - Move handles (X, Y, Z axes)
 * - Rotation ring for tilt
 * - Visual feedback on hover/drag
 */

import { useRef, useState, useCallback } from "react";
import { useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useRollerCoaster } from "@/lib/stores/useRollerCoaster";
import { Html } from "@react-three/drei";

interface GizmoProps {
  position: THREE.Vector3;
  pointId: string;
  onDragStart: () => void;
  onDragEnd: () => void;
}

// Arrow handle for translation
function ArrowHandle({ 
  direction, 
  color, 
  position, 
  onDrag,
  label,
}: { 
  direction: THREE.Vector3; 
  color: string; 
  position: THREE.Vector3;
  onDrag: (delta: THREE.Vector3) => void;
  label: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera, raycaster, pointer, gl } = useThree();
  const dragPlane = useRef(new THREE.Plane());
  const dragStart = useRef(new THREE.Vector3());
  const lastPoint = useRef(new THREE.Vector3());
  
  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setDragging(true);
    
    // Create drag plane perpendicular to camera but containing the axis
    const cameraDir = new THREE.Vector3();
    camera.getWorldDirection(cameraDir);
    
    // Use a plane that makes sense for this axis
    const planeNormal = new THREE.Vector3();
    if (Math.abs(direction.y) > 0.9) {
      // Y-axis: use XZ plane
      planeNormal.set(0, 0, 1);
    } else {
      // X or Z axis: use a plane facing camera
      planeNormal.crossVectors(direction, cameraDir).cross(direction).normalize();
    }
    
    dragPlane.current.setFromNormalAndCoplanarPoint(planeNormal, position);
    
    // Get initial intersection
    raycaster.setFromCamera(pointer, camera);
    raycaster.ray.intersectPlane(dragPlane.current, dragStart.current);
    lastPoint.current.copy(dragStart.current);
    
    // Capture pointer
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [camera, direction, pointer, position, raycaster]);
  
  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    
    e.stopPropagation();
    
    // Get current intersection with drag plane
    const currentPoint = new THREE.Vector3();
    raycaster.setFromCamera(pointer, camera);
    raycaster.ray.intersectPlane(dragPlane.current, currentPoint);
    
    // Calculate delta along the axis
    const totalDelta = currentPoint.clone().sub(lastPoint.current);
    const axisDelta = direction.clone().multiplyScalar(totalDelta.dot(direction));
    
    lastPoint.current.copy(currentPoint);
    
    if (axisDelta.length() > 0.001) {
      onDrag(axisDelta);
    }
  }, [dragging, camera, direction, onDrag, pointer, raycaster]);
  
  const handlePointerUp = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);
  
  const handleColor = dragging ? '#ffffff' : (hovered ? '#ffff00' : color);
  const scale = hovered || dragging ? 1.2 : 1;
  
  return (
    <group position={position}>
      {/* Arrow shaft */}
      <mesh
        ref={meshRef}
        position={direction.clone().multiplyScalar(0.4)}
        rotation={
          direction.y !== 0 
            ? [0, 0, 0] 
            : direction.x !== 0 
              ? [0, 0, -Math.PI / 2]
              : [Math.PI / 2, 0, 0]
        }
        scale={[scale, scale, scale]}
        onPointerEnter={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerLeave={(e) => { e.stopPropagation(); setHovered(false); }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <cylinderGeometry args={[0.03, 0.03, 0.6, 8]} />
        <meshBasicMaterial color={handleColor} />
      </mesh>
      
      {/* Arrow head */}
      <mesh
        position={direction.clone().multiplyScalar(0.8)}
        rotation={
          direction.y !== 0 
            ? [0, 0, 0] 
            : direction.x !== 0 
              ? [0, 0, -Math.PI / 2]
              : [Math.PI / 2, 0, 0]
        }
        scale={[scale, scale, scale]}
        onPointerEnter={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerLeave={(e) => { e.stopPropagation(); setHovered(false); }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <coneGeometry args={[0.08, 0.2, 8]} />
        <meshBasicMaterial color={handleColor} />
      </mesh>
      
      {/* Label */}
      {(hovered || dragging) && (
        <Html position={direction.clone().multiplyScalar(1.1)} center>
          <div className="text-[10px] text-white bg-black/70 px-1 rounded">
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

// Rotation ring for tilt adjustment
function TiltRing({
  position,
  currentTilt,
  onTiltChange,
}: {
  position: THREE.Vector3;
  currentTilt: number;
  onTiltChange: (tilt: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const ringRef = useRef<THREE.Mesh>(null);
  const { camera, raycaster, pointer } = useThree();
  const startAngle = useRef(0);
  const startTilt = useRef(0);
  
  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setDragging(true);
    
    // Calculate angle from pointer to center
    const screenPos = position.clone().project(camera);
    const centerX = (screenPos.x + 1) / 2 * window.innerWidth;
    const centerY = (-screenPos.y + 1) / 2 * window.innerHeight;
    
    startAngle.current = Math.atan2(
      e.clientY - centerY,
      e.clientX - centerX
    );
    startTilt.current = currentTilt;
    
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [camera, position, currentTilt]);
  
  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    
    e.stopPropagation();
    
    const screenPos = position.clone().project(camera);
    const centerX = (screenPos.x + 1) / 2 * window.innerWidth;
    const centerY = (-screenPos.y + 1) / 2 * window.innerHeight;
    
    const currentAngle = Math.atan2(
      e.clientY - centerY,
      e.clientX - centerX
    );
    
    const deltaAngle = currentAngle - startAngle.current;
    const newTilt = startTilt.current + deltaAngle;
    
    // Clamp to reasonable range
    const clampedTilt = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, newTilt));
    onTiltChange(clampedTilt);
  }, [dragging, camera, position, onTiltChange]);
  
  const handlePointerUp = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);
  
  const ringColor = dragging ? '#ffffff' : (hovered ? '#ffff00' : '#a855f7');
  
  return (
    <group position={position}>
      {/* Tilt indicator ring */}
      <mesh
        ref={ringRef}
        rotation={[Math.PI / 2, 0, 0]}
        onPointerEnter={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerLeave={(e) => { e.stopPropagation(); setHovered(false); }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <torusGeometry args={[0.5, 0.03, 8, 32]} />
        <meshBasicMaterial 
          color={ringColor} 
          transparent 
          opacity={hovered || dragging ? 1 : 0.6}
        />
      </mesh>
      
      {/* Tilt indicator line */}
      <mesh
        rotation={[Math.PI / 2, 0, currentTilt]}
        position={[Math.cos(currentTilt + Math.PI / 2) * 0.5, 0, Math.sin(currentTilt + Math.PI / 2) * 0.5]}
      >
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color="#f472b6" />
      </mesh>
      
      {/* Tilt value label */}
      {(hovered || dragging) && (
        <Html position={[0, 0.8, 0]} center>
          <div className="text-[10px] text-white bg-purple-500/80 px-2 py-1 rounded whitespace-nowrap">
            Tilt: {((currentTilt * 180) / Math.PI).toFixed(1)}°
          </div>
        </Html>
      )}
    </group>
  );
}

// Center sphere for point selection
function CenterSphere({
  position,
  isSelected,
  onClick,
}: {
  position: THREE.Vector3;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  
  return (
    <mesh
      position={position}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerEnter={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerLeave={(e) => { e.stopPropagation(); setHovered(false); }}
    >
      <sphereGeometry args={[0.12, 16, 16]} />
      <meshBasicMaterial 
        color={isSelected ? '#fbbf24' : (hovered ? '#60a5fa' : '#94a3b8')}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}

// Main gizmo for a single track point
function TransformGizmo({ position, pointId, onDragStart, onDragEnd }: GizmoProps) {
  const { selectedPointId, selectPoint, updateTrackPoint, updateTrackPointTilt, trackPoints } = useRollerCoaster();
  const [isDragging, setIsDragging] = useState(false);
  
  const isSelected = selectedPointId === pointId;
  const point = trackPoints.find(p => p.id === pointId);
  
  const handleSelect = useCallback(() => {
    selectPoint(pointId);
  }, [pointId, selectPoint]);
  
  const handleDrag = useCallback((axis: 'x' | 'y' | 'z') => (delta: THREE.Vector3) => {
    if (!isDragging) {
      setIsDragging(true);
      onDragStart();
    }
    
    const newPosition = position.clone().add(delta);
    updateTrackPoint(pointId, newPosition);
  }, [isDragging, onDragStart, pointId, position, updateTrackPoint]);
  
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    onDragEnd();
  }, [onDragEnd]);
  
  const handleTiltChange = useCallback((tilt: number) => {
    updateTrackPointTilt(pointId, tilt);
  }, [pointId, updateTrackPointTilt]);
  
  if (!point) return null;
  
  return (
    <group>
      {/* Center selection sphere */}
      <CenterSphere 
        position={position} 
        isSelected={isSelected}
        onClick={handleSelect}
      />
      
      {/* Only show gizmo handles for selected point */}
      {isSelected && (
        <>
          {/* Translation arrows */}
          <ArrowHandle
            direction={new THREE.Vector3(1, 0, 0)}
            color="#ef4444"
            position={position}
            onDrag={handleDrag('x')}
            label="X"
          />
          <ArrowHandle
            direction={new THREE.Vector3(0, 1, 0)}
            color="#22c55e"
            position={position}
            onDrag={handleDrag('y')}
            label="Y (Height)"
          />
          <ArrowHandle
            direction={new THREE.Vector3(0, 0, 1)}
            color="#3b82f6"
            position={position}
            onDrag={handleDrag('z')}
            label="Z"
          />
          
          {/* Tilt ring */}
          <TiltRing
            position={position}
            currentTilt={point.tilt}
            onTiltChange={handleTiltChange}
          />
        </>
      )}
    </group>
  );
}

// Main EditorGizmos component
export function EditorGizmos() {
  const { trackPoints, mode, isDraggingPoint, setIsDraggingPoint } = useRollerCoaster();
  
  // Only show in build mode
  if (mode !== 'build') return null;
  
  const handleDragStart = useCallback(() => {
    setIsDraggingPoint(true);
  }, [setIsDraggingPoint]);
  
  const handleDragEnd = useCallback(() => {
    setIsDraggingPoint(false);
  }, [setIsDraggingPoint]);
  
  return (
    <group>
      {trackPoints.map((point) => (
        <TransformGizmo
          key={point.id}
          position={point.position}
          pointId={point.id}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
      ))}
    </group>
  );
}
