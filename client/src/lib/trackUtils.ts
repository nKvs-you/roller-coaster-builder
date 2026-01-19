import * as THREE from "three";
import type { LoopSegment, TrackPoint } from "./stores/useRollerCoaster";

// ============================================================================
// Shared types for track sampling
// ============================================================================

export interface TrackSection {
  type: "spline" | "roll";
  startProgress: number;
  endProgress: number;
  arcLength: number;
  rollFrame?: BarrelRollFrame;
  splineStartT?: number;
  splineEndT?: number;
  pointIndex?: number;
}

export interface BarrelRollFrame {
  entryPos: THREE.Vector3;
  forward: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
  radius: number;
  pitch: number;
}

export interface TrackSample {
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  up: THREE.Vector3;
  normal: THREE.Vector3;
  inRoll: boolean;
  tilt: number;
}

export interface RailSample {
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  up: THREE.Vector3;
  tilt: number;
}

// ============================================================================
// Track Statistics
// ============================================================================

export interface TrackStats {
  totalLength: number;
  maxHeight: number;
  minHeight: number;
  maxGrade: number; // percentage
  maxBanking: number; // degrees
  estimatedRideTime: number; // seconds
  numPoints: number;
  numLoops: number;
  hasProblems: boolean;
  problems: TrackProblem[];
}

export interface TrackProblem {
  type: "steep_grade" | "tight_turn" | "low_point" | "self_intersect";
  severity: "warning" | "error";
  message: string;
  pointIndex?: number;
}

// ============================================================================
// Core utilities for track curve creation
// ============================================================================

export function getTrackCurve(
  trackPoints: { position: THREE.Vector3 }[],
  isLooped: boolean = false
): THREE.CatmullRomCurve3 | null {
  if (trackPoints.length < 2) return null;
  const points = trackPoints.map((p) => p.position.clone());
  return new THREE.CatmullRomCurve3(points, isLooped, "catmullrom", 0.5);
}

export function interpolateTilt(
  trackPoints: { tilt: number }[],
  t: number,
  isLooped: boolean
): number {
  if (trackPoints.length < 2) return 0;

  const n = trackPoints.length;
  const scaledT = isLooped ? t * n : t * (n - 1);
  const index = Math.floor(scaledT);
  const frac = scaledT - index;

  if (isLooped) {
    const i0 = index % n;
    const i1 = (index + 1) % n;
    return trackPoints[i0].tilt * (1 - frac) + trackPoints[i1].tilt * frac;
  } else {
    if (index >= n - 1) return trackPoints[n - 1].tilt;
    return trackPoints[index].tilt * (1 - frac) + trackPoints[index + 1].tilt * frac;
  }
}

// ============================================================================
// Vertical loop (corkscrew) sampling functions
// ============================================================================

/**
 * Samples a vertical loop with corkscrew offset at parameter t (0-1)
 * θ(t) = 2π * (t - sin(2πt)/(2π)) ensures zero angular velocity at endpoints
 */
export function sampleVerticalLoopAnalytically(
  frame: BarrelRollFrame,
  t: number
): { point: THREE.Vector3; tangent: THREE.Vector3; up: THREE.Vector3; normal: THREE.Vector3 } {
  const { entryPos, forward, up: U0, right: R0, radius, pitch } = frame;

  const twoPi = Math.PI * 2;
  const corkscrewOffset = radius * 0.4;

  // Eased theta for smooth start/end
  const theta = twoPi * (t - Math.sin(twoPi * t) / twoPi);
  const dThetaDt = twoPi * (1 - Math.cos(twoPi * t));

  // Vertical loop with lateral corkscrew offset
  const point = new THREE.Vector3()
    .copy(entryPos)
    .addScaledVector(forward, pitch * t + radius * Math.sin(theta))
    .addScaledVector(U0, radius * (1 - Math.cos(theta)))
    .addScaledVector(R0, corkscrewOffset * Math.sin(theta));

  // Tangent includes corkscrew term
  const tangent = new THREE.Vector3()
    .copy(forward)
    .multiplyScalar(pitch + radius * Math.cos(theta) * dThetaDt)
    .addScaledVector(U0, radius * Math.sin(theta) * dThetaDt)
    .addScaledVector(R0, corkscrewOffset * Math.cos(theta) * dThetaDt)
    .normalize();

  // Up vector rotates for vertical loop effect
  const rotatedUp = new THREE.Vector3()
    .addScaledVector(U0, Math.cos(theta))
    .addScaledVector(forward, -Math.sin(theta))
    .normalize();

  const normal = R0.clone();

  return { point, tangent, up: rotatedUp, normal };
}

export function computeRollFrame(
  spline: THREE.CatmullRomCurve3,
  splineT: number,
  radius: number,
  pitch: number,
  rollOffset: THREE.Vector3
): BarrelRollFrame {
  const entryPos = spline.getPoint(splineT).add(rollOffset);
  const forward = spline.getTangent(splineT).normalize();

  // Use WORLD up for consistent roll orientation
  const worldUp = new THREE.Vector3(0, 1, 0);
  let entryUp = worldUp.clone();
  const upDot = entryUp.dot(forward);
  entryUp.sub(forward.clone().multiplyScalar(upDot));
  if (entryUp.length() > 0.001) {
    entryUp.normalize();
  } else {
    entryUp.set(1, 0, 0);
    const d = entryUp.dot(forward);
    entryUp.sub(forward.clone().multiplyScalar(d)).normalize();
  }

  const right = new THREE.Vector3().crossVectors(forward, entryUp).normalize();

  return { entryPos, forward, up: entryUp, right, radius, pitch };
}

export function computeRollArcLength(radius: number, pitch: number): number {
  const steps = 100;
  let length = 0;
  const twoPi = Math.PI * 2;

  for (let i = 0; i < steps; i++) {
    const t1 = i / steps;
    const t2 = (i + 1) / steps;

    const theta1 = twoPi * (t1 - Math.sin(twoPi * t1) / twoPi);
    const theta2 = twoPi * (t2 - Math.sin(twoPi * t2) / twoPi);
    const dTheta = theta2 - theta1;

    const dForward = pitch / steps;
    const dRadial = radius * Math.sqrt(dTheta * dTheta);

    length += Math.sqrt(dForward * dForward + dRadial * dRadial);
  }

  return length;
}

// ============================================================================
// Track section builder
// ============================================================================

export function buildTrackSections(
  trackPoints: TrackPoint[],
  loopSegments: LoopSegment[],
  isLooped: boolean
): { sections: TrackSection[]; totalArcLength: number; firstPeakProgress: number } {
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
      const rollFrame = computeRollFrame(
        curve,
        splineT,
        loopSeg.radius,
        loopSeg.pitch,
        rollOffset.clone()
      );

      const rollArcLength = computeRollArcLength(loopSeg.radius, loopSeg.pitch);

      sections.push({
        type: "roll",
        startProgress: 0,
        endProgress: 0,
        arcLength: rollArcLength,
        rollFrame,
        pointIndex: i,
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
      pointIndex: i,
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

  // Assign progress ranges
  let runningLength = 0;
  for (const section of sections) {
    section.startProgress = runningLength / accumulatedLength;
    runningLength += section.arcLength;
    section.endProgress = runningLength / accumulatedLength;
  }

  // Find first peak for chain lift calculation
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
}

// ============================================================================
// Hybrid track sampling (handles both spline and roll sections)
// ============================================================================

export function sampleHybridTrack(
  progress: number,
  sections: TrackSection[],
  spline: THREE.CatmullRomCurve3,
  loopSegments: LoopSegment[],
  trackPoints: { id: string; position: THREE.Vector3 }[],
  isLooped: boolean
): TrackSample | null {
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

  const localT =
    (progress - section.startProgress) / (section.endProgress - section.startProgress);

  if (section.type === "roll" && section.rollFrame) {
    const sample = sampleVerticalLoopAnalytically(section.rollFrame, localT);
    return { ...sample, inRoll: true, tilt: 0 };
  } else if (section.splineStartT !== undefined && section.splineEndT !== undefined) {
    const splineT =
      section.splineStartT + localT * (section.splineEndT - section.splineStartT);
    const point = spline.getPoint(splineT);
    const tangent = spline.getTangent(splineT).normalize();

    const loopMap = new Map<string, LoopSegment>();
    for (const seg of loopSegments) {
      loopMap.set(seg.entryPointId, seg);
    }

    const numPoints = trackPoints.length;
    const totalSplineSegments = isLooped ? numPoints : numPoints - 1;

    // Compute total loop offset for closed track compensation
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

    point.add(rollOffset);

    // Apply progressive compensation for closed tracks
    if (isLooped) {
      const compensation = totalLoopOffset.clone().multiplyScalar(-splineT);
      point.add(compensation);
    }

    // Use world-up anchored frame
    const worldUp = new THREE.Vector3(0, 1, 0);
    let up: THREE.Vector3;

    const right = new THREE.Vector3().crossVectors(tangent, worldUp);

    if (right.length() > 0.01) {
      right.normalize();
      up = new THREE.Vector3().crossVectors(right, tangent).normalize();
    } else {
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

    const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

    return { point, tangent, up, normal, inRoll: false, tilt: 0 };
  }

  return null;
}

// ============================================================================
// Track statistics and validation
// ============================================================================

export function computeTrackStats(
  trackPoints: TrackPoint[],
  loopSegments: LoopSegment[],
  isLooped: boolean
): TrackStats {
  const stats: TrackStats = {
    totalLength: 0,
    maxHeight: 0,
    minHeight: Infinity,
    maxGrade: 0,
    maxBanking: 0,
    estimatedRideTime: 0,
    numPoints: trackPoints.length,
    numLoops: loopSegments.length,
    hasProblems: false,
    problems: [],
  };

  if (trackPoints.length < 2) {
    stats.minHeight = 0;
    return stats;
  }

  const { sections, totalArcLength } = buildTrackSections(trackPoints, loopSegments, isLooped);
  stats.totalLength = totalArcLength;

  const curve = getTrackCurve(trackPoints, isLooped);
  if (!curve) {
    stats.minHeight = 0;
    return stats;
  }

  // Sample along the track to find min/max values
  const samples = 100;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const sample = sampleHybridTrack(t, sections, curve, loopSegments, trackPoints, isLooped);
    if (sample) {
      stats.maxHeight = Math.max(stats.maxHeight, sample.point.y);
      stats.minHeight = Math.min(stats.minHeight, sample.point.y);

      // Calculate grade (angle of tangent)
      const grade = Math.abs(Math.asin(sample.tangent.y)) * (180 / Math.PI);
      stats.maxGrade = Math.max(stats.maxGrade, grade);
    }
  }

  // Check for banking
  for (const point of trackPoints) {
    stats.maxBanking = Math.max(stats.maxBanking, Math.abs(point.tilt));
  }

  // Estimate ride time (rough approximation)
  const avgSpeed = 10; // m/s
  stats.estimatedRideTime = totalArcLength / avgSpeed;

  // Validate track for problems
  validateTrack(trackPoints, loopSegments, isLooped, stats);

  if (stats.minHeight === Infinity) stats.minHeight = 0;

  return stats;
}

function validateTrack(
  trackPoints: TrackPoint[],
  loopSegments: LoopSegment[],
  isLooped: boolean,
  stats: TrackStats
): void {
  // Check for steep grades
  if (stats.maxGrade > 80) {
    stats.problems.push({
      type: "steep_grade",
      severity: "error",
      message: `Extremely steep grade detected (${stats.maxGrade.toFixed(0)}°). Track may not be rideable.`,
    });
    stats.hasProblems = true;
  } else if (stats.maxGrade > 60) {
    stats.problems.push({
      type: "steep_grade",
      severity: "warning",
      message: `Very steep grade (${stats.maxGrade.toFixed(0)}°). Consider adjusting track.`,
    });
    stats.hasProblems = true;
  }

  // Check for points too close to ground
  for (let i = 0; i < trackPoints.length; i++) {
    if (trackPoints[i].position.y < 0.3) {
      stats.problems.push({
        type: "low_point",
        severity: "warning",
        message: `Point ${i + 1} is very close to ground level.`,
        pointIndex: i,
      });
      stats.hasProblems = true;
    }
  }

  // Check for consecutive points that are too close (may cause jerky motion)
  for (let i = 1; i < trackPoints.length; i++) {
    const dist = trackPoints[i].position.distanceTo(trackPoints[i - 1].position);
    if (dist < 0.5) {
      stats.problems.push({
        type: "tight_turn",
        severity: "warning",
        message: `Points ${i} and ${i + 1} are very close together.`,
        pointIndex: i,
      });
      stats.hasProblems = true;
    }
  }
}

// ============================================================================
// Format helpers
// ============================================================================

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)}km`;
  }
  return `${meters.toFixed(0)}m`;
}
