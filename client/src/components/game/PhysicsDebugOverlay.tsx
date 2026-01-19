/**
 * PhysicsDebugOverlay Component
 * 
 * Debug visualization for physics simulation:
 * - Force vectors
 * - Velocity arrows
 * - Collision bounds
 * - Track curvature
 * - G-force heatmap on track
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useRollerCoaster } from "@/lib/stores/useRollerCoaster";
import { usePhysicsSimulation } from "@/hooks/usePhysicsSimulation";
import { getTrackCurve } from "./Track";
import { Line, Html } from "@react-three/drei";

interface DebugOverlayProps {
  showVelocity?: boolean;
  showForces?: boolean;
  showBounds?: boolean;
  showCurvature?: boolean;
  showGForceHeatmap?: boolean;
}

// Arrow helper for visualizing vectors
function DebugArrow({ 
  origin, 
  direction, 
  length, 
  color,
  label,
}: { 
  origin: THREE.Vector3; 
  direction: THREE.Vector3; 
  length: number;
  color: string;
  label?: string;
}) {
  const endPoint = origin.clone().addScaledVector(direction.normalize(), length);
  
  return (
    <group>
      <Line
        points={[origin.toArray(), endPoint.toArray()]}
        color={color}
        lineWidth={2}
      />
      <mesh position={endPoint}>
        <coneGeometry args={[0.1, 0.3, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {label && (
        <Html position={endPoint.clone().addScaledVector(direction, 0.3)}>
          <div className="text-[9px] text-white bg-black/60 px-1 rounded whitespace-nowrap">
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

// Velocity vector visualization
function VelocityVector({ carPosition, tangent, speed }: {
  carPosition: THREE.Vector3;
  tangent: THREE.Vector3;
  speed: number;
}) {
  return (
    <DebugArrow
      origin={carPosition}
      direction={tangent}
      length={Math.min(speed * 0.5, 5)}
      color="#22c55e"
      label={`v: ${speed.toFixed(1)} m/s`}
    />
  );
}

// Force vectors (gravity, normal, friction)
function ForceVectors({ carPosition, tangent, up, gForce }: {
  carPosition: THREE.Vector3;
  tangent: THREE.Vector3;
  up: THREE.Vector3;
  gForce: number;
}) {
  const gravity = new THREE.Vector3(0, -1, 0);
  const normal = up.clone();
  const friction = tangent.clone().multiplyScalar(-1);
  
  return (
    <group>
      {/* Gravity */}
      <DebugArrow
        origin={carPosition.clone().add(new THREE.Vector3(0.3, 0, 0))}
        direction={gravity}
        length={1}
        color="#ef4444"
        label="Fg"
      />
      
      {/* Normal force */}
      <DebugArrow
        origin={carPosition.clone().add(new THREE.Vector3(-0.3, 0, 0))}
        direction={normal}
        length={gForce * 0.5}
        color="#3b82f6"
        label={`Fn: ${gForce.toFixed(2)}G`}
      />
      
      {/* Friction */}
      <DebugArrow
        origin={carPosition.clone().add(new THREE.Vector3(0, 0, 0.3))}
        direction={friction}
        length={0.3}
        color="#f59e0b"
        label="Ff"
      />
    </group>
  );
}

// Bounding box visualization
function BoundingBox({ trackPoints }: { trackPoints: THREE.Vector3[] }) {
  const bounds = useMemo(() => {
    if (trackPoints.length === 0) {
      return { min: new THREE.Vector3(), max: new THREE.Vector3() };
    }
    
    const min = trackPoints[0].clone();
    const max = trackPoints[0].clone();
    
    for (const p of trackPoints) {
      min.min(p);
      max.max(p);
    }
    
    // Add padding
    min.subScalar(2);
    max.addScalar(2);
    
    return { min, max };
  }, [trackPoints]);
  
  const center = bounds.min.clone().add(bounds.max).multiplyScalar(0.5);
  const size = bounds.max.clone().sub(bounds.min);
  
  return (
    <group>
      <mesh position={center}>
        <boxGeometry args={[size.x, size.y, size.z]} />
        <meshBasicMaterial 
          color="#60a5fa" 
          wireframe 
          transparent 
          opacity={0.3}
        />
      </mesh>
      
      {/* Dimension labels */}
      <Html position={[center.x, bounds.max.y + 1, center.z]}>
        <div className="text-[10px] text-cyan-400 bg-black/60 px-2 py-1 rounded">
          {size.x.toFixed(1)}m × {size.y.toFixed(1)}m × {size.z.toFixed(1)}m
        </div>
      </Html>
    </group>
  );
}

// Track curvature visualization
function CurvatureVisualization({ curve, isLooped }: { 
  curve: THREE.CatmullRomCurve3;
  isLooped: boolean;
}) {
  const points = useMemo(() => {
    const result: Array<{ pos: THREE.Vector3; curvature: number }> = [];
    const samples = 100;
    
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const pos = curve.getPoint(t);
      
      // Calculate curvature (change in tangent direction)
      const epsilon = 0.01;
      const t1 = Math.max(0, t - epsilon);
      const t2 = Math.min(1, t + epsilon);
      
      const tan1 = curve.getTangent(t1);
      const tan2 = curve.getTangent(t2);
      
      const angle = Math.acos(Math.max(-1, Math.min(1, tan1.dot(tan2))));
      const distance = curve.getPoint(t1).distanceTo(curve.getPoint(t2));
      
      const curvature = distance > 0 ? angle / distance : 0;
      
      result.push({ pos, curvature });
    }
    
    return result;
  }, [curve]);
  
  return (
    <group>
      {points.map((p, i) => {
        // Color based on curvature (green = straight, red = tight)
        const hue = Math.max(0, 120 - p.curvature * 500);
        const color = `hsl(${hue}, 100%, 50%)`;
        
        return (
          <mesh key={i} position={p.pos.clone().add(new THREE.Vector3(0, 2, 0))}>
            <sphereGeometry args={[0.1 + p.curvature * 2, 8, 8]} />
            <meshBasicMaterial color={color} transparent opacity={0.7} />
          </mesh>
        );
      })}
    </group>
  );
}

// G-Force heatmap on track
function GForceHeatmap({ curve, hasChainLift }: {
  curve: THREE.CatmullRomCurve3;
  hasChainLift: boolean;
}) {
  const segments = useMemo(() => {
    const result: Array<{ start: THREE.Vector3; end: THREE.Vector3; gForce: number }> = [];
    const samples = 50;
    
    let speed = 3; // Initial speed
    const GRAVITY = 9.81;
    const FRICTION = 0.015;
    const DRAG = 0.02;
    
    // Find first peak for chain lift
    let maxHeight = 0;
    let peakT = 0.2;
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const height = curve.getPoint(t).y;
      if (height > maxHeight) {
        maxHeight = height;
        peakT = t;
      }
    }
    
    for (let i = 0; i < samples; i++) {
      const t1 = i / samples;
      const t2 = (i + 1) / samples;
      
      const p1 = curve.getPoint(t1);
      const p2 = curve.getPoint(t2);
      
      // Simple physics
      const onChainLift = hasChainLift && t1 < peakT;
      
      if (onChainLift) {
        speed = 3;
      } else {
        const dy = p2.y - p1.y;
        const ds = p1.distanceTo(p2);
        const grade = ds > 0 ? dy / ds : 0;
        
        const acceleration = -grade * GRAVITY - FRICTION * GRAVITY - DRAG * speed * speed;
        speed = Math.max(0.5, speed + acceleration * 0.1);
      }
      
      // Calculate G-force from curvature
      const tan1 = curve.getTangent(t1);
      const tan2 = curve.getTangent(t2);
      const angle = Math.acos(Math.max(-1, Math.min(1, tan1.dot(tan2))));
      const distance = p1.distanceTo(p2);
      const curvature = distance > 0 ? angle / distance : 0;
      
      const centripetalAccel = curvature * speed * speed;
      const gForce = 1 + centripetalAccel / GRAVITY;
      
      result.push({ start: p1, end: p2, gForce });
    }
    
    return result;
  }, [curve, hasChainLift]);
  
  return (
    <group>
      {segments.map((seg, i) => {
        // Color: green (1G) -> yellow (2G) -> red (4G+)
        const normalizedG = Math.min(1, (seg.gForce - 1) / 3);
        const hue = 120 - normalizedG * 120;
        const color = `hsl(${hue}, 100%, 50%)`;
        
        const midpoint = seg.start.clone().add(seg.end).multiplyScalar(0.5);
        midpoint.y += 1.5;
        
        return (
          <group key={i}>
            <Line
              points={[
                seg.start.clone().add(new THREE.Vector3(0, 1, 0)).toArray(),
                seg.end.clone().add(new THREE.Vector3(0, 1, 0)).toArray(),
              ]}
              color={color}
              lineWidth={4}
            />
            
            {/* Show value at significant points */}
            {i % 10 === 0 && (
              <Html position={midpoint}>
                <div 
                  className="text-[8px] px-1 rounded"
                  style={{ 
                    backgroundColor: color,
                    color: normalizedG > 0.5 ? 'white' : 'black',
                  }}
                >
                  {seg.gForce.toFixed(1)}G
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

// Debug info panel
function DebugInfoPanel({ physicsData }: { physicsData: any }) {
  return (
    <div className="absolute bottom-4 left-4 pointer-events-none z-50">
      <div className="glass-panel rounded-lg p-3 text-[10px] font-mono">
        <div className="text-cyan-400 font-bold mb-2">🔧 DEBUG INFO</div>
        <table className="text-white">
          <tbody>
            <tr>
              <td className="text-slate-400 pr-3">Speed:</td>
              <td>{physicsData.speed?.toFixed(2)} m/s</td>
            </tr>
            <tr>
              <td className="text-slate-400 pr-3">Height:</td>
              <td>{physicsData.height?.toFixed(2)} m</td>
            </tr>
            <tr>
              <td className="text-slate-400 pr-3">G-Vert:</td>
              <td>{physicsData.gForceVertical?.toFixed(2)} G</td>
            </tr>
            <tr>
              <td className="text-slate-400 pr-3">G-Lat:</td>
              <td>{physicsData.gForceLateral?.toFixed(2)} G</td>
            </tr>
            <tr>
              <td className="text-slate-400 pr-3">Accel:</td>
              <td>{physicsData.acceleration?.toFixed(2)} m/s²</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Main component
export function PhysicsDebugOverlay({
  showVelocity = true,
  showForces = true,
  showBounds = true,
  showCurvature = false,
  showGForceHeatmap = true,
}: DebugOverlayProps) {
  const { trackPoints, isRiding, rideProgress, isLooped, hasChainLift } = useRollerCoaster();
  const { physicsData } = usePhysicsSimulation();
  
  const { curve, carPosition, tangent, up } = useMemo(() => {
    if (trackPoints.length < 2) {
      return { 
        curve: null, 
        carPosition: new THREE.Vector3(), 
        tangent: new THREE.Vector3(0, 0, 1),
        up: new THREE.Vector3(0, 1, 0),
      };
    }
    
    const curve = getTrackCurve(trackPoints, isLooped);
    if (!curve) {
      return { 
        curve: null, 
        carPosition: new THREE.Vector3(), 
        tangent: new THREE.Vector3(0, 0, 1),
        up: new THREE.Vector3(0, 1, 0),
      };
    }
    
    const t = Math.max(0, Math.min(0.9999, rideProgress));
    const carPosition = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    
    // Calculate up vector
    const worldUp = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(tangent, worldUp).normalize();
    const up = new THREE.Vector3().crossVectors(right, tangent).normalize();
    
    return { curve, carPosition, tangent, up };
  }, [trackPoints, isLooped, rideProgress]);
  
  if (trackPoints.length < 2 || !curve) return null;
  
  return (
    <>
      {/* 3D Debug visualizations */}
      <group>
        {/* Bounding box */}
        {showBounds && (
          <BoundingBox trackPoints={trackPoints.map(p => p.position)} />
        )}
        
        {/* Curvature visualization */}
        {showCurvature && (
          <CurvatureVisualization curve={curve} isLooped={isLooped} />
        )}
        
        {/* G-Force heatmap */}
        {showGForceHeatmap && (
          <GForceHeatmap curve={curve} hasChainLift={hasChainLift} />
        )}
        
        {/* Riding-specific debug */}
        {isRiding && (
          <>
            {/* Velocity vector */}
            {showVelocity && (
              <VelocityVector 
                carPosition={carPosition} 
                tangent={tangent} 
                speed={physicsData.speed} 
              />
            )}
            
            {/* Force vectors */}
            {showForces && (
              <ForceVectors
                carPosition={carPosition}
                tangent={tangent}
                up={up}
                gForce={physicsData.gForceTotal}
              />
            )}
          </>
        )}
      </group>
      
      {/* 2D Debug panel */}
      {isRiding && <DebugInfoPanel physicsData={physicsData} />}
    </>
  );
}
