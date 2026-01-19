/**
 * Physics Engine WASM Loader and TypeScript Interface
 * 
 * This module provides a TypeScript wrapper around the C++ physics engine
 * compiled to WebAssembly. It handles async loading and provides type-safe APIs.
 */

// Type definitions matching C++ exports
export interface Vec3 {
  x: number;
  y: number;
  z: number;
  length(): number;
  normalized(): Vec3;
  dot(v: Vec3): number;
  distanceTo(v: Vec3): number;
}

export interface TrackPointData {
  position: Vec3;
  tilt: number;
  hasLoop: boolean;
  loopRadius: number;
  loopPitch: number;
}

export interface PhysicsState {
  speed: number;
  gForceVertical: number;
  gForceLateral: number;
  gForceTotal: number;
  progress: number;
  height: number;
  isOnChainLift: boolean;
  isInLoop: boolean;
  bankAngle: number;
}

export interface TrackSample {
  point: Vec3;
  tangent: Vec3;
  up: Vec3;
  right: Vec3;
  tilt: number;
  inLoop: boolean;
  curvature: number;
  grade: number;
}

export interface ValidationResult {
  isValid: boolean;
  message: string;
  severity: number; // 0 = info, 1 = warning, 2 = error
  pointIndex: number;
  value: number;
}

export interface PhysicsEngineInstance {
  setChainLift(enabled: boolean): void;
  reset(): void;
  getSpeed(): number;
  getGForceVertical(): number;
  getGForceLateral(): number;
  getGForceTotal(): number;
  getProgress(): number;
  getHeight(): number;
  getIsOnChainLift(): boolean;
  getIsInLoop(): boolean;
  getPositionX(): number;
  getPositionY(): number;
  getPositionZ(): number;
  getVelocityX(): number;
  getVelocityY(): number;
  getVelocityZ(): number;
  setProgress(p: number): void;
  setSpeed(s: number): void;
  delete(): void;
}

export interface TrackValidatorStatic {
  validate(points: TrackPointDataVector, isLooped: boolean): ValidationResultVector;
}

export interface CollisionDetectorStatic {
  checkGroundCollision(position: Vec3, groundHeight?: number): boolean;
}

// Vector types for passing arrays
export interface TrackPointDataVector {
  size(): number;
  get(index: number): TrackPointData;
  push_back(item: TrackPointData): void;
  delete(): void;
}

export interface ValidationResultVector {
  size(): number;
  get(index: number): ValidationResult;
  delete(): void;
}

// Module interface
export interface PhysicsEngineModule {
  Vec3: new (x?: number, y?: number, z?: number) => Vec3;
  TrackPointData: new () => TrackPointData;
  PhysicsEngine: new () => PhysicsEngineInstance;
  TrackValidator: TrackValidatorStatic;
  CollisionDetector: CollisionDetectorStatic;
  TrackPointDataVector: new () => TrackPointDataVector;
  ValidationResultVector: new () => ValidationResultVector;
}

// Loader state
let moduleInstance: PhysicsEngineModule | null = null;
let loadPromise: Promise<PhysicsEngineModule> | null = null;
let loadError: Error | null = null;

/**
 * Check if WASM physics engine is available
 */
export function isWasmAvailable(): boolean {
  return moduleInstance !== null;
}

/**
 * Load the WASM physics engine module
 * Returns a promise that resolves when the module is ready
 */
export async function loadPhysicsEngine(): Promise<PhysicsEngineModule> {
  // Return existing instance
  if (moduleInstance) {
    return moduleInstance;
  }
  
  // Return existing load promise
  if (loadPromise) {
    return loadPromise;
  }
  
  // Re-throw previous error
  if (loadError) {
    throw loadError;
  }
  
  // Start loading
  loadPromise = (async () => {
    try {
      // Dynamic import of the WASM module
      const wasmPath = '/wasm/physics_engine.js';
      
      // Check if the WASM file exists
      const response = await fetch(wasmPath, { method: 'HEAD' });
      
      if (!response.ok) {
        throw new Error(`WASM module not found at ${wasmPath}. Have you built the native code?`);
      }
      
      // Import the ES6 module
      const PhysicsEngineFactory = await import(/* @vite-ignore */ wasmPath);
      
      // Initialize the module
      const module = await PhysicsEngineFactory.default();
      
      moduleInstance = module as PhysicsEngineModule;
      console.log('✓ Physics Engine WASM loaded successfully');
      
      return moduleInstance;
    } catch (error) {
      loadError = error instanceof Error ? error : new Error(String(error));
      console.warn('⚠ WASM physics engine not available, using JavaScript fallback:', loadError.message);
      throw loadError;
    }
  })();
  
  return loadPromise;
}

/**
 * Get the loaded physics engine module (throws if not loaded)
 */
export function getPhysicsEngine(): PhysicsEngineModule {
  if (!moduleInstance) {
    throw new Error('Physics engine not loaded. Call loadPhysicsEngine() first.');
  }
  return moduleInstance;
}

/**
 * Create a new physics engine instance
 */
export function createPhysicsEngine(): PhysicsEngineInstance | null {
  if (!moduleInstance) {
    return null;
  }
  return new moduleInstance.PhysicsEngine();
}

/**
 * Create a Vec3 from JavaScript values
 */
export function createVec3(x: number, y: number, z: number): Vec3 | null {
  if (!moduleInstance) {
    return null;
  }
  return new moduleInstance.Vec3(x, y, z);
}

/**
 * Create a TrackPointData from JavaScript values
 */
export function createTrackPointData(
  x: number, y: number, z: number,
  tilt: number = 0,
  hasLoop: boolean = false,
  loopRadius: number = 8,
  loopPitch: number = 12
): TrackPointData | null {
  if (!moduleInstance) {
    return null;
  }
  
  const point = new moduleInstance.TrackPointData();
  point.position = new moduleInstance.Vec3(x, y, z);
  point.tilt = tilt;
  point.hasLoop = hasLoop;
  point.loopRadius = loopRadius;
  point.loopPitch = loopPitch;
  
  return point;
}

/**
 * Validate track using native C++ validator
 */
export function validateTrackNative(
  points: Array<{ x: number; y: number; z: number; tilt: number; hasLoop?: boolean }>,
  isLooped: boolean
): ValidationResult[] | null {
  if (!moduleInstance) {
    return null;
  }
  
  const trackPoints = new moduleInstance.TrackPointDataVector();
  
  for (const p of points) {
    const point = new moduleInstance.TrackPointData();
    point.position = new moduleInstance.Vec3(p.x, p.y, p.z);
    point.tilt = p.tilt;
    point.hasLoop = p.hasLoop || false;
    trackPoints.push_back(point);
  }
  
  const results = moduleInstance.TrackValidator.validate(trackPoints, isLooped);
  
  // Convert to JavaScript array
  const jsResults: ValidationResult[] = [];
  for (let i = 0; i < results.size(); i++) {
    const r = results.get(i);
    jsResults.push({
      isValid: r.isValid,
      message: r.message,
      severity: r.severity,
      pointIndex: r.pointIndex,
      value: r.value,
    });
  }
  
  // Clean up
  trackPoints.delete();
  results.delete();
  
  return jsResults;
}

/**
 * High-level physics simulation wrapper
 */
export class PhysicsSimulation {
  private engine: PhysicsEngineInstance | null = null;
  private isInitialized = false;
  
  constructor() {
    if (moduleInstance) {
      this.engine = new moduleInstance.PhysicsEngine();
      this.isInitialized = true;
    }
  }
  
  get isAvailable(): boolean {
    return this.isInitialized && this.engine !== null;
  }
  
  setChainLift(enabled: boolean): void {
    this.engine?.setChainLift(enabled);
  }
  
  reset(): void {
    this.engine?.reset();
  }
  
  getState(): PhysicsState | null {
    if (!this.engine) return null;
    
    return {
      speed: this.engine.getSpeed(),
      gForceVertical: this.engine.getGForceVertical(),
      gForceLateral: this.engine.getGForceLateral(),
      gForceTotal: this.engine.getGForceTotal(),
      progress: this.engine.getProgress(),
      height: this.engine.getHeight(),
      isOnChainLift: this.engine.getIsOnChainLift(),
      isInLoop: this.engine.getIsInLoop(),
      bankAngle: 0, // Would need to be added to C++
    };
  }
  
  getPosition(): { x: number; y: number; z: number } | null {
    if (!this.engine) return null;
    
    return {
      x: this.engine.getPositionX(),
      y: this.engine.getPositionY(),
      z: this.engine.getPositionZ(),
    };
  }
  
  getVelocity(): { x: number; y: number; z: number } | null {
    if (!this.engine) return null;
    
    return {
      x: this.engine.getVelocityX(),
      y: this.engine.getVelocityY(),
      z: this.engine.getVelocityZ(),
    };
  }
  
  setProgress(p: number): void {
    this.engine?.setProgress(p);
  }
  
  setSpeed(s: number): void {
    this.engine?.setSpeed(s);
  }
  
  dispose(): void {
    this.engine?.delete();
    this.engine = null;
    this.isInitialized = false;
  }
}
