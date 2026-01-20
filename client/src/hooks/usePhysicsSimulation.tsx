/**
 * usePhysicsSimulation Hook
 * 
 * Provides accurate roller coaster physics simulation
 * Pure JavaScript - no WASM or WebGL required for physics calculations
 * 
 * Physics features:
 * - Energy conservation
 * - Accurate G-force calculations
 * - Centripetal force for curves
 * - Air drag and rolling friction
 * - Chain lift mechanics
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRollerCoaster, TrackPoint, LoopSegment } from '@/lib/stores/useRollerCoaster';
import { 
  RollerCoasterPhysics, 
  TrackPointInput,
  validateTrack as validateTrackPhysics,
  ValidationIssue,
  PHYSICS_CONSTANTS,
  PhysicsState,
} from '@/lib/physics/PhysicsEngine';

export interface PhysicsData {
  // Speed
  speed: number;          // m/s
  speedKmh: number;       // km/h  
  speedMph: number;       // mph
  
  // G-forces
  gForceVertical: number;   // Positive = pushed into seat
  gForceLateral: number;    // Positive = pushed right
  gForceLongitudinal: number; // Positive = pushed back (braking)
  gForceTotal: number;      // Magnitude
  
  // Position
  height: number;           // meters
  progress: number;         // 0-1 along track
  arcLength: number;        // meters traveled
  
  // Track geometry
  grade: number;            // slope percentage
  curvature: number;        // 1/radius (m⁻¹)
  bankAngle: number;        // radians
  
  // State
  isOnChainLift: boolean;
  isInLoop: boolean;
  isAirtime: boolean;
  isBraking: boolean;
  
  // Energy (for display/debugging)
  kineticEnergy: number;    // Joules
  potentialEnergy: number;  // Joules
  totalEnergy: number;      // Joules
  
  // Acceleration
  acceleration: number;     // m/s² (tangential)
}

export interface PhysicsSimulationResult {
  // State
  isSimulating: boolean;
  physicsData: PhysicsData;
  
  // Validation
  validationErrors: Array<{
    type: 'error' | 'warning' | 'info';
    message: string;
    severity: 'warning' | 'error' | 'info';
    pointIndex?: number;
    value?: number;
  }>;
  
  // Controls
  startSimulation: () => void;
  stopSimulation: () => void;
  validateTrack: () => void;
  
  // Physics constants for UI
  constants: typeof PHYSICS_CONSTANTS;
}

// Re-export PhysicsData type for other components
export type { PhysicsState };

const DEFAULT_PHYSICS: PhysicsData = {
  speed: 0,
  speedKmh: 0,
  speedMph: 0,
  gForceVertical: 1.0,
  gForceLateral: 0,
  gForceLongitudinal: 0,
  gForceTotal: 1.0,
  height: 0,
  progress: 0,
  arcLength: 0,
  grade: 0,
  curvature: 0,
  bankAngle: 0,
  isOnChainLift: false,
  isInLoop: false,
  isAirtime: false,
  isBraking: false,
  kineticEnergy: 0,
  potentialEnergy: 0,
  totalEnergy: 0,
  acceleration: 0,
};

/**
 * Convert TrackPoint[] to TrackPointInput[] for physics engine
 */
function convertTrackPoints(trackPoints: TrackPoint[]): TrackPointInput[] {
  return trackPoints.map(p => ({
    position: {
      x: p.position.x,
      y: p.position.y,
      z: p.position.z,
    },
    tilt: p.tilt,
    hasLoop: p.hasLoop,
  }));
}

/**
 * Main physics simulation hook
 */
export function usePhysicsSimulation(): PhysicsSimulationResult {
  const {
    trackPoints,
    loopSegments,
    isLooped,
    hasChainLift,
    rideProgress,
    rideSpeed,
    isRiding,
    setRideProgress,
    setRideSpeed,
  } = useRollerCoaster();

  // State
  const [isSimulating, setIsSimulating] = useState(false);
  const [physicsData, setPhysicsData] = useState<PhysicsData>(DEFAULT_PHYSICS);
  const [validationErrors, setValidationErrors] = useState<PhysicsSimulationResult['validationErrors']>([]);

  // Refs for physics engine
  const physicsEngine = useRef<RollerCoasterPhysics | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const lastTime = useRef(performance.now());
  const isInitialized = useRef(false);

  // Initialize physics engine
  useEffect(() => {
    physicsEngine.current = new RollerCoasterPhysics();
    isInitialized.current = true;
    
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      physicsEngine.current = null;
    };
  }, []);

  // Update track when points change
  useEffect(() => {
    if (!physicsEngine.current || trackPoints.length < 2) return;
    
    const points = convertTrackPoints(trackPoints);
    physicsEngine.current.setTrack(points, isLooped);
    physicsEngine.current.setChainLift(hasChainLift);
    
  }, [trackPoints, isLooped, hasChainLift]);

  // Main simulation loop
  useEffect(() => {
    if (!isRiding || !physicsEngine.current) {
      setIsSimulating(false);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
      return;
    }

    setIsSimulating(true);
    
    // Reset physics engine for new ride
    physicsEngine.current.reset();
    physicsEngine.current.setSpeed(rideSpeed || 1);
    lastTime.current = performance.now();

    const updatePhysics = () => {
      if (!physicsEngine.current || !isRiding) return;
      
      const now = performance.now();
      const dt = Math.min((now - lastTime.current) / 1000, 0.05); // Cap at 50ms
      lastTime.current = now;
      
      // Step physics simulation
      const state = physicsEngine.current.step(dt);
      
      // Handle track completion
      if (!isLooped && state.progress >= 0.99) {
        // Ride complete
        return;
      }
      
      // Convert physics state to PhysicsData
      const speeds = physicsEngine.current.getSpeeds();
      
      const newPhysicsData: PhysicsData = {
        speed: state.speed,
        speedKmh: speeds.kmh,
        speedMph: speeds.mph,
        gForceVertical: state.gForceVertical,
        gForceLateral: state.gForceLateral,
        gForceLongitudinal: state.gForceLongitudinal,
        gForceTotal: state.gForceTotal,
        height: state.position.y,
        progress: state.progress,
        arcLength: state.arcLength,
        grade: state.trackSample.grade,
        curvature: state.trackSample.curvature,
        bankAngle: state.trackSample.bankAngle,
        isOnChainLift: state.isOnChainLift,
        isInLoop: state.isInLoop,
        isAirtime: state.isAirtime,
        isBraking: state.isBraking,
        kineticEnergy: state.kineticEnergy,
        potentialEnergy: state.potentialEnergy,
        totalEnergy: state.totalEnergy,
        acceleration: state.acceleration.length(),
      };
      
      setPhysicsData(newPhysicsData);
      
      // Continue simulation
      if (isRiding) {
        animationFrameId.current = requestAnimationFrame(updatePhysics);
      }
    };

    animationFrameId.current = requestAnimationFrame(updatePhysics);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, [isRiding, rideSpeed, isLooped, setRideProgress, setRideSpeed]);

  // Validate track
  const validateTrack = useCallback(() => {
    if (trackPoints.length < 2) {
      setValidationErrors([{
        type: 'error',
        message: 'Need at least 2 track points',
        severity: 'error',
      }]);
      return;
    }

    const points = convertTrackPoints(trackPoints);
    const issues = validateTrackPhysics(points, isLooped);
    
    const errors = issues.map(issue => ({
      type: issue.type,
      message: issue.message,
      severity: issue.type as 'warning' | 'error' | 'info',
      pointIndex: issue.pointIndex,
      value: issue.value,
    }));
    
    setValidationErrors(errors);
  }, [trackPoints, isLooped]);

  // Start simulation
  const startSimulation = useCallback(() => {
    if (!physicsEngine.current) return;
    
    setIsSimulating(true);
    physicsEngine.current.reset();
    physicsEngine.current.setSpeed(1);
    lastTime.current = performance.now();
  }, []);

  // Stop simulation
  const stopSimulation = useCallback(() => {
    setIsSimulating(false);
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
  }, []);

  return {
    isSimulating,
    physicsData,
    validationErrors,
    startSimulation,
    stopSimulation,
    validateTrack,
    constants: PHYSICS_CONSTANTS,
  };
}

/**
 * Hook to get physics data without running simulation
 * Useful for displaying track statistics
 */
export function useTrackPhysicsPreview(
  trackPoints: TrackPoint[],
  isLooped: boolean,
  hasChainLift: boolean
): {
  maxSpeed: number;
  maxGForce: number;
  minGForce: number;
  totalLength: number;
  rideTime: number;
  issues: ValidationIssue[];
} {
  return useMemo(() => {
    if (trackPoints.length < 2) {
      return {
        maxSpeed: 0,
        maxGForce: 1,
        minGForce: 1,
        totalLength: 0,
        rideTime: 0,
        issues: [],
      };
    }
    
    const points = convertTrackPoints(trackPoints);
    const physics = new RollerCoasterPhysics();
    physics.setTrack(points, isLooped);
    physics.setChainLift(hasChainLift);
    physics.reset();
    physics.setSpeed(1);
    
    let maxSpeed = 0;
    let maxGForce = 1;
    let minGForce = 1;
    let totalTime = 0;
    const dt = 0.016;
    const maxSteps = 10000;
    
    for (let i = 0; i < maxSteps; i++) {
      const state = physics.step(dt);
      totalTime += dt;
      
      maxSpeed = Math.max(maxSpeed, state.speed);
      maxGForce = Math.max(maxGForce, state.gForceTotal);
      minGForce = Math.min(minGForce, state.gForceVertical);
      
      if (!isLooped && state.progress >= 0.99) break;
      if (isLooped && i > 100 && state.progress < 0.01) break;
    }
    
    const issues = validateTrackPhysics(points, isLooped);
    
    return {
      maxSpeed,
      maxGForce,
      minGForce,
      totalLength: physics.getState().arcLength || 0,
      rideTime: totalTime,
      issues,
    };
  }, [trackPoints, isLooped, hasChainLift]);
}
