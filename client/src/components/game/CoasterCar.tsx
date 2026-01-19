import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useRollerCoaster, LoopSegment } from "@/lib/stores/useRollerCoaster";
import { getTrackCurve } from "./Track";
import { 
  sampleVerticalLoopAnalytically,
  computeRollFrame,
  computeRollArcLength,
  type TrackSection,
  type BarrelRollFrame,
} from "@/lib/trackUtils";

function sampleHybridTrack(
  progress: number,
  sections: TrackSection[],
  spline: THREE.CatmullRomCurve3,
  loopSegments: LoopSegment[],
  trackPoints: { id: string; position: THREE.Vector3 }[],
  isLooped: boolean
): { point: THREE.Vector3; tangent: THREE.Vector3; up: THREE.Vector3 } | null {
  if (sections.length === 0) return null;
  
  progress = Math.max(0, Math.min(progress, 0.9999));
  
  let section: TrackSection | null = null;
  for (const s of sections) {
    if (progress >= s.startProgress && progress < s.endProgress) {
      section = s;
      break;
    }
  }
  
  if (!section) {
    section = sections[sections.length - 1];
  }
  
  const localT = (progress - section.startProgress) / (section.endProgress - section.startProgress);
  
  if (section.type === "roll" && section.rollFrame) {
    return sampleVerticalLoopAnalytically(section.rollFrame, localT);
  } else if (section.splineStartT !== undefined && section.splineEndT !== undefined) {
    const splineT = section.splineStartT + localT * (section.splineEndT - section.splineStartT);
    const point = spline.getPoint(splineT);
    const tangent = spline.getTangent(splineT).normalize();
    
    let rollOffset = new THREE.Vector3(0, 0, 0);
    const loopMap = new Map<string, LoopSegment>();
    for (const seg of loopSegments) {
      loopMap.set(seg.entryPointId, seg);
    }
    
    const numPoints = trackPoints.length;
    const totalSplineSegments = isLooped ? numPoints : numPoints - 1;
    
    for (let i = 0; i < numPoints && i <= (section.pointIndex ?? 0); i++) {
      const tp = trackPoints[i];
      const loopSeg = loopMap.get(tp.id);
      if (loopSeg) {
        const spT = i / totalSplineSegments;
        const fwd = spline.getTangent(spT).normalize();
        rollOffset.addScaledVector(fwd, loopSeg.pitch);
      }
    }
    
    point.add(rollOffset);
    
    let up = new THREE.Vector3(0, 1, 0);
    const dot = up.dot(tangent);
    up.sub(tangent.clone().multiplyScalar(dot));
    if (up.lengthSq() > 0.001) {
      up.normalize();
    } else {
      up.set(1, 0, 0);
      const d = up.dot(tangent);
      up.sub(tangent.clone().multiplyScalar(d)).normalize();
    }
    
    return { point, tangent, up };
  }
  
  return null;
}

export function CoasterCar() {
  const meshRef = useRef<THREE.Group>(null);
  const { trackPoints, loopSegments, rideProgress, isRiding, mode, isLooped } = useRollerCoaster();
  
  const sections = useMemo(() => {
    if (trackPoints.length < 2) return [];
    
    const curve = getTrackCurve(trackPoints, isLooped);
    if (!curve) return [];
    
    const loopMap = new Map<string, LoopSegment>();
    for (const seg of loopSegments) {
      loopMap.set(seg.entryPointId, seg);
    }
    
    const numPoints = trackPoints.length;
    const totalSplineSegments = isLooped ? numPoints : numPoints - 1;
    const sections: TrackSection[] = [];
    let accumulatedLength = 0;
    let rollOffset = new THREE.Vector3(0, 0, 0);
    
    let prevTangent = curve.getTangent(0).normalize();
    let prevUp = new THREE.Vector3(0, 1, 0);
    const initDot = prevUp.dot(prevTangent);
    prevUp.sub(prevTangent.clone().multiplyScalar(initDot));
    if (prevUp.length() < 0.01) {
      prevUp.set(1, 0, 0);
      const d = prevUp.dot(prevTangent);
      prevUp.sub(prevTangent.clone().multiplyScalar(d));
    }
    prevUp.normalize();
    
    for (let i = 0; i < numPoints; i++) {
      const point = trackPoints[i];
      const loopSeg = loopMap.get(point.id);
      
      if (loopSeg) {
        const splineT = i / totalSplineSegments;
        const rollFrame = computeRollFrame(curve, splineT, loopSeg.radius, loopSeg.pitch, rollOffset.clone());
        
        const rollArcLength = computeRollArcLength(loopSeg.radius, loopSeg.pitch);
        
        sections.push({
          type: "roll",
          startProgress: 0,
          endProgress: 0,
          arcLength: rollArcLength,
          rollFrame,
          pointIndex: i
        });
        accumulatedLength += rollArcLength;
        
        rollOffset.addScaledVector(rollFrame.forward, loopSeg.pitch);
        
        prevTangent.copy(rollFrame.forward);
        prevUp.copy(rollFrame.up);
      }
      
      if (i >= numPoints - 1 && !isLooped) continue;
      
      const splineStartT = i / totalSplineSegments;
      const splineEndT = (i + 1) / totalSplineSegments;
      
      let segmentLength = 0;
      const subSamples = 10;
      for (let s = 0; s < subSamples; s++) {
        const t1 = splineStartT + (s / subSamples) * (splineEndT - splineStartT);
        const t2 = splineStartT + ((s + 1) / subSamples) * (splineEndT - splineStartT);
        const p1 = curve.getPoint(t1);
        const p2 = curve.getPoint(t2);
        segmentLength += p1.distanceTo(p2);
      }
      
      sections.push({
        type: "spline",
        startProgress: 0,
        endProgress: 0,
        arcLength: segmentLength,
        splineStartT,
        splineEndT,
        pointIndex: i
      });
      accumulatedLength += segmentLength;
      
      const endTangent = curve.getTangent(splineEndT).normalize();
      const dot = Math.max(-1, Math.min(1, prevTangent.dot(endTangent)));
      if (dot < 0.9999 && dot > -0.9999) {
        const axis = new THREE.Vector3().crossVectors(prevTangent, endTangent);
        if (axis.length() > 0.0001) {
          axis.normalize();
          const angle = Math.acos(dot);
          const quat = new THREE.Quaternion().setFromAxisAngle(axis, angle);
          prevUp.applyQuaternion(quat);
        }
      }
      const upDot = prevUp.dot(endTangent);
      prevUp.sub(endTangent.clone().multiplyScalar(upDot));
      if (prevUp.length() > 0.001) prevUp.normalize();
      prevTangent.copy(endTangent);
    }
    
    let runningLength = 0;
    for (const section of sections) {
      section.startProgress = runningLength / accumulatedLength;
      runningLength += section.arcLength;
      section.endProgress = runningLength / accumulatedLength;
    }
    
    return sections;
  }, [trackPoints, loopSegments, isLooped]);
  
  useFrame(() => {
    if (!meshRef.current || !isRiding) return;
    
    const curve = getTrackCurve(trackPoints, isLooped);
    if (!curve || sections.length === 0) return;
    
    const sample = sampleHybridTrack(rideProgress, sections, curve, loopSegments, trackPoints, isLooped);
    if (!sample) return;
    
    const { point: position, tangent, up } = sample;
    
    meshRef.current.position.copy(position);
    meshRef.current.position.addScaledVector(up, -0.18);
    
    const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const matrix = new THREE.Matrix4().makeBasis(right, up, tangent);
    const euler = new THREE.Euler().setFromRotationMatrix(matrix);
    
    meshRef.current.rotation.copy(euler);
  });
  
  if (!isRiding || mode !== "ride") return null;
  
  const CAR_SCALE = 0.6;
  
  return (
    <group ref={meshRef} scale={[CAR_SCALE, CAR_SCALE, CAR_SCALE]}>
      {/* Main car body - sleek design */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[1.1, 0.4, 2.2]} />
        <meshStandardMaterial 
          color="#E53935" 
          metalness={0.8} 
          roughness={0.2}
        />
      </mesh>
      
      {/* Front nose - aerodynamic */}
      <mesh position={[0, 0.15, 1.3]} castShadow>
        <boxGeometry args={[0.9, 0.3, 0.5]} />
        <meshStandardMaterial color="#C62828" metalness={0.8} roughness={0.2} />
      </mesh>
      
      {/* Cockpit/seat back */}
      <mesh position={[0, 0.45, -0.4]} castShadow>
        <boxGeometry args={[0.9, 0.4, 0.8]} />
        <meshStandardMaterial color="#212121" roughness={0.6} />
      </mesh>
      
      {/* Windshield */}
      <mesh position={[0, 0.5, 0.3]} rotation={[-0.4, 0, 0]} castShadow>
        <boxGeometry args={[0.85, 0.02, 0.5]} />
        <meshStandardMaterial color="#4FC3F7" metalness={0.9} roughness={0.1} transparent opacity={0.7} />
      </mesh>
      
      {/* Side rails */}
      <mesh position={[0.55, 0.35, 0]} castShadow>
        <boxGeometry args={[0.08, 0.15, 1.8]} />
        <meshStandardMaterial color="#FF5722" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[-0.55, 0.35, 0]} castShadow>
        <boxGeometry args={[0.08, 0.15, 1.8]} />
        <meshStandardMaterial color="#FF5722" metalness={0.7} roughness={0.3} />
      </mesh>
      
      {/* Headlights */}
      <mesh position={[0.3, 0.15, 1.55]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshBasicMaterial color="#FFF59D" />
      </mesh>
      <mesh position={[-0.3, 0.15, 1.55]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshBasicMaterial color="#FFF59D" />
      </mesh>
      
      {/* Tail lights */}
      <mesh position={[0.35, 0.2, -1.1]}>
        <boxGeometry args={[0.12, 0.1, 0.05]} />
        <meshBasicMaterial color="#FF1744" />
      </mesh>
      <mesh position={[-0.35, 0.2, -1.1]}>
        <boxGeometry args={[0.12, 0.1, 0.05]} />
        <meshBasicMaterial color="#FF1744" />
      </mesh>
      
      {/* Wheels with rims */}
      {[
        [-0.5, -0.2, 0.7],
        [0.5, -0.2, 0.7],
        [-0.5, -0.2, -0.7],
        [0.5, -0.2, -0.7],
      ].map((pos, i) => (
        <group key={i} position={[pos[0], pos[1], pos[2]]}>
          {/* Tire */}
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.18, 0.12, 16]} />
            <meshStandardMaterial color="#1A1A1A" roughness={0.9} />
          </mesh>
          {/* Rim */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.13, 8]} />
            <meshStandardMaterial color="#B0BEC5" metalness={0.9} roughness={0.1} />
          </mesh>
        </group>
      ))}
      
      {/* Racing stripes */}
      <mesh position={[0, 0.31, 0]}>
        <boxGeometry args={[0.15, 0.01, 2.0]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.5} />
      </mesh>
    </group>
  );
}
