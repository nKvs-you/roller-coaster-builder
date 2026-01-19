/**
 * usePhysicsSimulation Hook
 * 
 * Integrates the C++ WASM physics engine with React/Three.js
 * Provides real-time physics simulation with fallback to JS implementation
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRollerCoaster, TrackPoint, LoopSegment } from '@/lib/stores/useRollerCoaster';
import {
  loadPhysicsEngine,
  isWasmAvailable,
  PhysicsSimulation,
  validateTrackNative,
  PhysicsState,
} from '@/lib/wasm/physicsEngine';

// Physics constants (matching C++)
const GRAVITY = 9.81;
const AIR_RESISTANCE = 0.02;
const ROLLING_FRICTION = 0.015;
const CHAIN_LIFT_SPEED = 3.0;

export interface PhysicsData {
  speed: number;          // m/s
  speedKmh: number;       // km/h
  speedMph: number;       // mph
  gForceVertical: number;
  gForceLateral: number;
  gForceTotal: number;
  height: number;
  isOnChainLift: boolean;
  isInLoop: boolean;
  acceleration: number;   // m/s²
  kinematicEnergy: number; // simplified
  potentialEnergy: number; // simplified
}

export interface PhysicsSimulationResult {
  isWasmLoaded: boolean;
  isSimulating: boolean;
  physicsData: PhysicsData;
  validationErrors: Array<{
    type: string;
    message: string;
    severity: 'warning' | 'error';
    pointIndex?: number;
  }>;
  startSimulation: () => void;
  stopSimulation: () => void;
  validateTrack: () => void;
}

const DEFAULT_PHYSICS: PhysicsData = {
  speed: 0,
  speedKmh: 0,
  speedMph: 0,
  gForceVertical: 1.0,
  gForceLateral: 0,
  gForceTotal: 1.0,
  height: 0,
  isOnChainLift: false,
  isInLoop: false,
  acceleration: 0,
  kinematicEnergy: 0,
  potentialEnergy: 0,
};

/**
 * JavaScript fallback physics simulation
 * Used when WASM is not available
 */
function simulatePhysicsJS(
  trackPoints: TrackPoint[],
  loopSegments: LoopSegment[],
  progress: number,
  speed: number,
  hasChainLift: boolean,
  isLooped: boolean,
  dt: number
): { newSpeed: number; gForce: number; height: number } {
  if (trackPoints.length < 2) {
    return { newSpeed: speed, gForce: 1.0, height: 0 };
  }

  // Find current height from progress
  const numPoints = trackPoints.length;
  const segmentCount = isLooped ? numPoints : numPoints - 1;
  const scaledProgress = progress * segmentCount;
  const index = Math.floor(scaledProgress);
  const frac = scaledProgress - index;

  let height = 0;
  if (index < numPoints - 1) {
    const h1 = trackPoints[index].position.y;
    const h2 = trackPoints[Math.min(index + 1, numPoints - 1)].position.y;
    height = h1 * (1 - frac) + h2 * frac;
  } else {
    height = trackPoints[numPoints - 1].position.y;
  }

  // Find first peak for chain lift
  let firstPeakProgress = 0.2;
  let maxHeight = trackPoints[0].position.y;
  for (let i = 1; i < numPoints; i++) {
    if (trackPoints[i].position.y > maxHeight) {
      maxHeight = trackPoints[i].position.y;
      firstPeakProgress = i / segmentCount;
    }
  }
  firstPeakProgress = Math.min(0.5, Math.max(0.1, firstPeakProgress));

  // Chain lift check
  const onChainLift = hasChainLift && progress < firstPeakProgress;

  let newSpeed = speed;

  if (onChainLift) {
    // Chain lift: constant speed
    newSpeed = CHAIN_LIFT_SPEED;
  } else {
    // Calculate grade (slope)
    let grade = 0;
    if (index < numPoints - 1) {
      const h1 = trackPoints[index].position.y;
      const h2 = trackPoints[Math.min(index + 1, numPoints - 1)].position.y;
      const p1 = trackPoints[index].position;
      const p2 = trackPoints[Math.min(index + 1, numPoints - 1)].position;
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const horizontalDist = Math.sqrt(dx * dx + dz * dz);
      if (horizontalDist > 0.001) {
        grade = (h2 - h1) / horizontalDist;
      }
    }

    // Physics calculation
    const gravityComponent = -grade * GRAVITY;
    const dragForce = AIR_RESISTANCE * speed * speed * Math.sign(speed);
    const frictionForce = ROLLING_FRICTION * GRAVITY;

    const netAcceleration = gravityComponent - dragForce - frictionForce;
    newSpeed = speed + netAcceleration * dt;
    newSpeed = Math.max(0.5, newSpeed); // Minimum speed
  }

  // Estimate G-force (simplified)
  const gForce = 1.0 + (newSpeed - speed) / (GRAVITY * dt);

  return { newSpeed, gForce: Math.max(0, Math.min(5, gForce)), height };
}

export function usePhysicsSimulation(): PhysicsSimulationResult {
  const {
    trackPoints,
    loopSegments,
    isLooped,
    hasChainLift,
    rideProgress,
    rideSpeed,
    isRiding,
  } = useRollerCoaster();

  const [isWasmLoaded, setIsWasmLoaded] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [physicsData, setPhysicsData] = useState<PhysicsData>(DEFAULT_PHYSICS);
  const [validationErrors, setValidationErrors] = useState<PhysicsSimulationResult['validationErrors']>([]);

  const wasmSimulation = useRef<PhysicsSimulation | null>(null);
  const lastProgress = useRef(0);
  const lastSpeed = useRef(1.0);
  const animationFrameId = useRef<number | null>(null);
  const lastTime = useRef(performance.now());

  // Load WASM on mount
  useEffect(() => {
    loadPhysicsEngine()
      .then(() => {
        setIsWasmLoaded(true);
        wasmSimulation.current = new PhysicsSimulation();
      })
      .catch(() => {
        // WASM not available, will use JS fallback
        setIsWasmLoaded(false);
      });

    return () => {
      wasmSimulation.current?.dispose();
    };
  }, []);

  // Update physics during ride
  useEffect(() => {
    if (!isRiding) {
      setIsSimulating(false);
      return;
    }

    setIsSimulating(true);

    const updatePhysics = () => {
      const now = performance.now();
      const dt = Math.min((now - lastTime.current) / 1000, 0.05); // Cap at 50ms
      lastTime.current = now;

      let speed = lastSpeed.current;
      let gForce = 1.0;
      let height = 0;

      if (wasmSimulation.current?.isAvailable) {
        // Use WASM physics
        wasmSimulation.current.setChainLift(hasChainLift);
        wasmSimulation.current.setProgress(rideProgress);
        
        const state = wasmSimulation.current.getState();
        if (state) {
          speed = state.speed;
          gForce = state.gForceTotal;
          height = state.height;
        }
      } else {
        // Use JS fallback
        const result = simulatePhysicsJS(
          trackPoints,
          loopSegments,
          rideProgress,
          lastSpeed.current,
          hasChainLift,
          isLooped,
          dt
        );
        speed = result.newSpeed;
        gForce = result.gForce;
        height = result.height;
      }

      lastSpeed.current = speed;
      lastProgress.current = rideProgress;

      const acceleration = (speed - lastSpeed.current) / dt;

      // Update physics data
      setPhysicsData({
        speed,
        speedKmh: speed * 3.6,
        speedMph: speed * 2.237,
        gForceVertical: gForce,
        gForceLateral: 0, // Would need lateral calculation
        gForceTotal: gForce,
        height,
        isOnChainLift: hasChainLift && rideProgress < 0.2,
        isInLoop: false, // Would need loop detection
        acceleration,
        kinematicEnergy: 0.5 * speed * speed,
        potentialEnergy: height * GRAVITY,
      });

      if (isRiding) {
        animationFrameId.current = requestAnimationFrame(updatePhysics);
      }
    };

    lastTime.current = performance.now();
    animationFrameId.current = requestAnimationFrame(updatePhysics);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isRiding, trackPoints, loopSegments, hasChainLift, isLooped, rideProgress]);

  // Validate track
  const validateTrack = useCallback(() => {
    if (trackPoints.length < 2) {
      setValidationErrors([{
        type: 'insufficient_points',
        message: 'Need at least 2 track points',
        severity: 'error',
      }]);
      return;
    }

    // Try WASM validation first
    if (isWasmLoaded) {
      const points = trackPoints.map(p => ({
        x: p.position.x,
        y: p.position.y,
        z: p.position.z,
        tilt: p.tilt,
        hasLoop: p.hasLoop,
      }));

      const nativeResults = validateTrackNative(points, isLooped);
      
      if (nativeResults) {
        const errors = nativeResults
          .filter(r => r.severity > 0)
          .map(r => ({
            type: r.severity === 2 ? 'error' : 'warning',
            message: r.message,
            severity: r.severity === 2 ? 'error' as const : 'warning' as const,
            pointIndex: r.pointIndex >= 0 ? r.pointIndex : undefined,
          }));
        
        setValidationErrors(errors);
        return;
      }
    }

    // JS fallback validation
    const errors: PhysicsSimulationResult['validationErrors'] = [];

    // Check for low points
    for (let i = 0; i < trackPoints.length; i++) {
      if (trackPoints[i].position.y < 0.5) {
        errors.push({
          type: 'low_point',
          message: `Point ${i + 1} is too low`,
          severity: 'warning',
          pointIndex: i,
        });
      }
    }

    // Check for steep grades
    for (let i = 0; i < trackPoints.length - 1; i++) {
      const h1 = trackPoints[i].position.y;
      const h2 = trackPoints[i + 1].position.y;
      const p1 = trackPoints[i].position;
      const p2 = trackPoints[i + 1].position;
      
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const horizontalDist = Math.sqrt(dx * dx + dz * dz);
      
      if (horizontalDist > 0.1) {
        const grade = Math.abs((h2 - h1) / horizontalDist) * 100;
        if (grade > 80) {
          errors.push({
            type: 'steep_grade',
            message: `Segment ${i + 1}-${i + 2} is too steep (${grade.toFixed(0)}%)`,
            severity: 'error',
            pointIndex: i,
          });
        } else if (grade > 60) {
          errors.push({
            type: 'steep_grade',
            message: `Segment ${i + 1}-${i + 2} is steep (${grade.toFixed(0)}%)`,
            severity: 'warning',
            pointIndex: i,
          });
        }
      }
    }

    setValidationErrors(errors);
  }, [trackPoints, isLooped, isWasmLoaded]);

  const startSimulation = useCallback(() => {
    setIsSimulating(true);
    lastSpeed.current = 1.0;
    lastProgress.current = 0;
    wasmSimulation.current?.reset();
  }, []);

  const stopSimulation = useCallback(() => {
    setIsSimulating(false);
  }, []);

  return {
    isWasmLoaded,
    isSimulating,
    physicsData,
    validationErrors,
    startSimulation,
    stopSimulation,
    validateTrack,
  };
}
