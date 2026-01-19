import { useRef, useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
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

export function RideCamera() {
  const { camera } = useThree();
  const { trackPoints, loopSegments, isRiding, rideProgress, setRideProgress, rideSpeed, stopRide, isLooped, hasChainLift } = useRollerCoaster();
  
  const curveRef = useRef<THREE.CatmullRomCurve3 | null>(null);
  const previousCameraPos = useRef(new THREE.Vector3());
  const previousLookAt = useRef(new THREE.Vector3());
  const previousUp = useRef(new THREE.Vector3(0, 1, 0));
  const smoothedUp = useRef(new THREE.Vector3(0, 1, 0));
  const maxHeightReached = useRef(0);
  const transportedUp = useRef(new THREE.Vector3(0, 1, 0));
  const lastProgress = useRef(0);
  
  const { sections, totalArcLength, firstPeakProgress } = useMemo(() => {
    if (trackPoints.length < 2) {
      return { sections: [], totalArcLength: 0, firstPeakProgress: 0.2 };
    }
    
    const curve = getTrackCurve(trackPoints, isLooped);
    if (!curve) return { sections: [], totalArcLength: 0, firstPeakProgress: 0.2 };
    
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
        
        // After eased roll, tangent and up return to entry values
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
    
    let maxHeight = -Infinity;
    let peakProgress = 0.2;
    let foundClimb = false;
    
    for (let p = 0; p <= 0.5; p += 0.01) {
      const sample = sampleHybridTrack(p, sections, curve, loopSegments, trackPoints, isLooped);
      if (sample) {
        if (sample.tangent.y > 0.1) foundClimb = true;
        if (foundClimb && sample.point.y > maxHeight) {
          maxHeight = sample.point.y;
          peakProgress = p;
        }
        if (foundClimb && sample.tangent.y < -0.1 && p > peakProgress) break;
      }
    }
    
    return { sections, totalArcLength: accumulatedLength, firstPeakProgress: peakProgress };
  }, [trackPoints, loopSegments, isLooped]);
  
  useEffect(() => {
    curveRef.current = getTrackCurve(trackPoints, isLooped);
  }, [trackPoints, isLooped]);
  
  useEffect(() => {
    if (isRiding && curveRef.current) {
      const startPoint = curveRef.current.getPoint(0);
      maxHeightReached.current = startPoint.y;
      transportedUp.current.set(0, 1, 0);
      lastProgress.current = 0;
    }
  }, [isRiding]);
  
  useFrame((_, delta) => {
    if (!isRiding || !curveRef.current || sections.length === 0) return;
    
    const curve = curveRef.current;
    
    const currentSample = sampleHybridTrack(rideProgress, sections, curve, loopSegments, trackPoints, isLooped);
    if (!currentSample) return;
    
    const currentHeight = currentSample.point.y;
    
    let speed: number;
    
    if (hasChainLift && rideProgress < firstPeakProgress) {
      const chainSpeed = 0.9 * rideSpeed;
      speed = chainSpeed;
      maxHeightReached.current = Math.max(maxHeightReached.current, currentHeight);
    } else {
      const constantSpeed = 12.0;
      speed = constantSpeed * rideSpeed;
    }
    
    const progressDelta = (speed * delta) / totalArcLength;
    let newProgress = rideProgress + progressDelta;
    
    if (newProgress >= 1) {
      if (isLooped) {
        newProgress = newProgress % 1;
        if (hasChainLift) {
          const startPoint = curve.getPoint(0);
          maxHeightReached.current = startPoint.y;
        }
      } else {
        stopRide();
        return;
      }
    }
    
    setRideProgress(newProgress);
    
    const sample = sampleHybridTrack(newProgress, sections, curve, loopSegments, trackPoints, isLooped);
    if (!sample) return;
    
    const { point: position, tangent, up: sampleUp, inRoll } = sample;
    
    // Use the sample's up vector directly - it's already computed using world-up anchored frame
    // This keeps the camera aligned with the track geometry
    lastProgress.current = newProgress;
    
    // Smooth the up vector for less jarring camera movement
    // Use slower smoothing during rolls for dramatic effect
    const upSmoothFactor = inRoll ? 0.15 : 0.3;
    smoothedUp.current.lerp(sampleUp, upSmoothFactor);
    smoothedUp.current.normalize();
    
    const baseUpVector = smoothedUp.current.clone();
    
    // Higher camera position to enhance the feeling of sitting on top of the coaster
    const cameraHeight = 2.5;
    const cameraOffset = baseUpVector.clone().multiplyScalar(cameraHeight);
    const targetCameraPos = position.clone().add(cameraOffset);
    
    // Look further ahead and slightly down for better track visibility
    const lookDistance = 12;
    const lookDownOffset = -0.5; // Look slightly below horizon to see track ahead
    const targetLookAt = position.clone()
      .add(tangent.clone().multiplyScalar(lookDistance))
      .add(baseUpVector.clone().multiplyScalar(lookDownOffset));
    
    // Use speed-based smoothing - faster movement = less smoothing for responsiveness
    const baseSmoothFactor = 0.4;
    const speedFactor = Math.min(1.0, speed / 15.0);
    const smoothFactor = baseSmoothFactor + (0.3 * speedFactor);
    
    previousCameraPos.current.lerp(targetCameraPos, smoothFactor);
    previousLookAt.current.lerp(targetLookAt, smoothFactor * 0.8);
    
    camera.position.copy(previousCameraPos.current);
    
    camera.up.copy(baseUpVector);
    camera.lookAt(previousLookAt.current);
  });
  
  return null;
}

function sampleHybridTrack(
  progress: number,
  sections: TrackSection[],
  spline: THREE.CatmullRomCurve3,
  loopSegments: LoopSegment[],
  trackPoints: { id: string; position: THREE.Vector3 }[],
  isLooped: boolean
): { point: THREE.Vector3; tangent: THREE.Vector3; up: THREE.Vector3; inRoll: boolean } | null {
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
    const sample = sampleVerticalLoopAnalytically(section.rollFrame, localT);
    return { ...sample, inRoll: true };
  } else if (section.splineStartT !== undefined && section.splineEndT !== undefined) {
    const splineT = section.splineStartT + localT * (section.splineEndT - section.splineStartT);
    const point = spline.getPoint(splineT);
    const tangent = spline.getTangent(splineT).normalize();
    
    const loopMap = new Map<string, LoopSegment>();
    for (const seg of loopSegments) {
      loopMap.set(seg.entryPointId, seg);
    }
    
    const numPoints = trackPoints.length;
    const totalSplineSegments = isLooped ? numPoints : numPoints - 1;
    
    // First compute total loop offset (for closed track compensation)
    let totalLoopOffset = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < numPoints; i++) {
      const tp = trackPoints[i];
      const loopSeg = loopMap.get(tp.id);
      if (loopSeg) {
        const spT = i / totalSplineSegments;
        const fwd = spline.getTangent(spT).normalize();
        totalLoopOffset.addScaledVector(fwd, loopSeg.pitch);
      }
    }
    
    // Compute rollOffset up to current section
    let rollOffset = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < numPoints && i <= (section.pointIndex ?? 0); i++) {
      const tp = trackPoints[i];
      const loopSeg = loopMap.get(tp.id);
      if (loopSeg) {
        const spT = i / totalSplineSegments;
        const fwd = spline.getTangent(spT).normalize();
        rollOffset.addScaledVector(fwd, loopSeg.pitch);
      }
    }
    
    // Apply rollOffset
    point.add(rollOffset);
    
    // Apply progressive compensation for closed tracks (matches Track.tsx)
    if (isLooped) {
      const compensation = totalLoopOffset.clone().multiplyScalar(-splineT);
      point.add(compensation);
    }
    
    // Use world-up anchored frame to keep track level at hill peaks
    const worldUp = new THREE.Vector3(0, 1, 0);
    let up: THREE.Vector3;
    
    // Compute right vector from tangent and world up
    const right = new THREE.Vector3().crossVectors(tangent, worldUp);
    
    if (right.length() > 0.01) {
      // Normal case: tangent is not vertical
      right.normalize();
      up = new THREE.Vector3().crossVectors(right, tangent).normalize();
    } else {
      // Tangent is nearly vertical - use fallback
      up = new THREE.Vector3(0, 1, 0);
      const upDot = up.dot(tangent);
      up.sub(tangent.clone().multiplyScalar(upDot));
      if (up.length() > 0.001) {
        up.normalize();
      } else {
        up.set(1, 0, 0);
        const d = up.dot(tangent);
        up.sub(tangent.clone().multiplyScalar(d)).normalize();
      }
    }
    
    return { point, tangent, up, inRoll: false };
  }
  
  return null;
}
