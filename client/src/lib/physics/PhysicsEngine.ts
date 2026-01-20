/**
 * Accurate Roller Coaster Physics Engine
 * Pure JavaScript implementation - no WASM or WebGL required
 * 
 * Based on real physics principles:
 * - Conservation of energy
 * - Newtonian mechanics (F = ma)
 * - Centripetal acceleration for curves and loops
 * - Banking angle physics
 * - Realistic friction and drag models
 */

import * as THREE from 'three';

// =============================================================================
// Physical Constants
// =============================================================================

export const PHYSICS_CONSTANTS = {
  // Gravity (m/s²)
  GRAVITY: 9.80665,
  
  // Air properties at sea level, 20°C
  AIR_DENSITY: 1.204, // kg/m³
  
  // Car properties (based on real coaster cars)
  CAR_MASS: 500, // kg (empty car)
  PASSENGER_MASS: 75, // kg per passenger
  PASSENGERS: 4,
  CAR_FRONTAL_AREA: 1.5, // m²
  CAR_DRAG_COEFFICIENT: 0.35, // Cd (streamlined)
  
  // Wheel/track friction coefficients
  ROLLING_RESISTANCE_COEF: 0.005, // Steel wheels on steel track
  KINETIC_FRICTION_COEF: 0.05, // For braking
  
  // Chain lift
  CHAIN_LIFT_SPEED: 2.5, // m/s (typical for chain lift)
  CHAIN_LIFT_ACCELERATION: 0.5, // m/s² (smooth start)
  
  // Safety limits (real coaster limits)
  MAX_VERTICAL_G: 4.5, // Maximum positive G
  MIN_VERTICAL_G: -1.5, // Maximum negative G (airtime)
  MAX_LATERAL_G: 1.8, // Maximum lateral G
  MAX_SPEED: 50, // m/s (~180 km/h, ~112 mph)
  MIN_SPEED: 0.1, // m/s (prevent complete stop)
  
  // Integration
  PHYSICS_SUBSTEPS: 4, // For more accurate integration
};

// =============================================================================
// Vector Math Utilities
// =============================================================================

export class Vec3 {
  constructor(
    public x: number = 0,
    public y: number = 0,
    public z: number = 0
  ) {}
  
  static from(v: { x: number; y: number; z: number }): Vec3 {
    return new Vec3(v.x, v.y, v.z);
  }
  
  static fromThree(v: THREE.Vector3): Vec3 {
    return new Vec3(v.x, v.y, v.z);
  }
  
  toThree(): THREE.Vector3 {
    return new THREE.Vector3(this.x, this.y, this.z);
  }
  
  clone(): Vec3 {
    return new Vec3(this.x, this.y, this.z);
  }
  
  add(v: Vec3): Vec3 {
    return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z);
  }
  
  sub(v: Vec3): Vec3 {
    return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z);
  }
  
  scale(s: number): Vec3 {
    return new Vec3(this.x * s, this.y * s, this.z * s);
  }
  
  dot(v: Vec3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }
  
  cross(v: Vec3): Vec3 {
    return new Vec3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x
    );
  }
  
  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }
  
  lengthSq(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }
  
  normalize(): Vec3 {
    const len = this.length();
    if (len < 1e-10) return new Vec3(0, 1, 0);
    return this.scale(1 / len);
  }
  
  lerp(v: Vec3, t: number): Vec3 {
    return new Vec3(
      this.x + (v.x - this.x) * t,
      this.y + (v.y - this.y) * t,
      this.z + (v.z - this.z) * t
    );
  }
  
  distanceTo(v: Vec3): number {
    return this.sub(v).length();
  }
  
  projectOnto(v: Vec3): Vec3 {
    const vNorm = v.normalize();
    return vNorm.scale(this.dot(vNorm));
  }
}

// =============================================================================
// Track Sampling with Catmull-Rom Spline
// =============================================================================

export interface TrackPointInput {
  position: { x: number; y: number; z: number };
  tilt: number; // degrees
  hasLoop?: boolean;
  loopRadius?: number;
}

export interface TrackSample {
  position: Vec3;
  tangent: Vec3;       // Forward direction (normalized)
  normal: Vec3;        // Up direction (normalized)
  binormal: Vec3;      // Right direction (normalized)
  curvature: number;   // 1/radius (m⁻¹)
  torsion: number;     // Rate of twist (rad/m)
  grade: number;       // Slope percentage
  bankAngle: number;   // Banking angle (radians)
  arcLength: number;   // Distance from start (m)
}

export class TrackSpline {
  private points: Vec3[] = [];
  private tilts: number[] = [];
  private arcLengths: number[] = [];
  private totalLength: number = 0;
  private isLooped: boolean = false;
  private tension: number = 0.5;
  private samples: TrackSample[] = [];
  private sampleResolution: number = 100; // samples per unit length
  
  constructor(
    trackPoints: TrackPointInput[],
    isLooped: boolean = false,
    tension: number = 0.5
  ) {
    this.isLooped = isLooped;
    this.tension = tension;
    
    this.points = trackPoints.map(p => Vec3.from(p.position));
    this.tilts = trackPoints.map(p => p.tilt * Math.PI / 180);
    
    this.computeArcLengths();
    this.precomputeSamples();
  }
  
  private computeArcLengths(): void {
    this.arcLengths = [0];
    this.totalLength = 0;
    
    if (this.points.length < 2) return;
    
    const steps = 1000;
    let prevPoint = this.getPointRaw(0);
    
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const currPoint = this.getPointRaw(t);
      const dist = prevPoint.distanceTo(currPoint);
      this.totalLength += dist;
      this.arcLengths.push(this.totalLength);
      prevPoint = currPoint;
    }
  }
  
  private precomputeSamples(): void {
    if (this.points.length < 2) return;
    
    const numSamples = Math.max(100, Math.floor(this.totalLength * this.sampleResolution));
    this.samples = [];
    
    for (let i = 0; i <= numSamples; i++) {
      const t = i / numSamples;
      this.samples.push(this.sampleAt(t));
    }
  }
  
  private catmullRomInterpolate(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
    const t2 = t * t;
    const t3 = t2 * t;
    
    // Catmull-Rom with tension parameter
    const a = this.tension;
    
    const x = 0.5 * (
      (2 * p1.x) +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
    );
    
    const y = 0.5 * (
      (2 * p1.y) +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    );
    
    const z = 0.5 * (
      (2 * p1.z) +
      (-p0.z + p2.z) * t +
      (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
      (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3
    );
    
    return new Vec3(x, y, z);
  }
  
  private getControlPoints(i: number): [Vec3, Vec3, Vec3, Vec3] {
    const n = this.points.length;
    
    if (this.isLooped) {
      const p0 = this.points[((i - 1) % n + n) % n];
      const p1 = this.points[i % n];
      const p2 = this.points[(i + 1) % n];
      const p3 = this.points[(i + 2) % n];
      return [p0, p1, p2, p3];
    } else {
      const p0 = this.points[Math.max(0, i - 1)];
      const p1 = this.points[i];
      const p2 = this.points[Math.min(n - 1, i + 1)];
      const p3 = this.points[Math.min(n - 1, i + 2)];
      return [p0, p1, p2, p3];
    }
  }
  
  private getPointRaw(t: number): Vec3 {
    if (this.points.length < 2) return new Vec3();
    
    t = Math.max(0, Math.min(1, t));
    
    const n = this.points.length;
    const segments = this.isLooped ? n : n - 1;
    
    const scaledT = t * segments;
    let i = Math.floor(scaledT);
    let frac = scaledT - i;
    
    if (i >= segments) {
      i = segments - 1;
      frac = 1;
    }
    
    const [p0, p1, p2, p3] = this.getControlPoints(i);
    return this.catmullRomInterpolate(p0, p1, p2, p3, frac);
  }
  
  private getTangentRaw(t: number): Vec3 {
    const epsilon = 0.0001;
    const p1 = this.getPointRaw(Math.max(0, t - epsilon));
    const p2 = this.getPointRaw(Math.min(1, t + epsilon));
    return p2.sub(p1).normalize();
  }
  
  private getTiltAtT(t: number): number {
    if (this.tilts.length < 2) return 0;
    
    const n = this.tilts.length;
    const segments = this.isLooped ? n : n - 1;
    
    const scaledT = t * segments;
    const i = Math.floor(scaledT);
    const frac = scaledT - i;
    
    const i1 = Math.min(i, n - 1);
    const i2 = Math.min(i + 1, n - 1);
    
    // Smooth interpolation of tilt
    return this.tilts[i1] * (1 - frac) + this.tilts[i2] * frac;
  }
  
  private sampleAt(t: number): TrackSample {
    const position = this.getPointRaw(t);
    const tangent = this.getTangentRaw(t);
    
    // Calculate curvature using second derivative
    const epsilon = 0.001;
    const t1 = Math.max(0, t - epsilon);
    const t2 = Math.min(1, t + epsilon);
    const tan1 = this.getTangentRaw(t1);
    const tan2 = this.getTangentRaw(t2);
    
    const dt = (t2 - t1) * this.totalLength;
    const curvatureVec = tan2.sub(tan1).scale(1 / Math.max(dt, 0.001));
    const curvature = curvatureVec.length();
    
    // Grade (slope percentage)
    const grade = tangent.y * 100; // Convert to percentage
    
    // Bank angle from track tilt + auto-banking for curves
    const trackTilt = this.getTiltAtT(t);
    
    // Calculate frame (Frenet-Serret with banking)
    let up = new Vec3(0, 1, 0);
    
    // Natural up from curvature
    if (curvature > 0.001) {
      const curvatureDir = curvatureVec.normalize();
      // Blend between vertical and curve-following up
      up = up.lerp(curvatureDir, Math.min(curvature * 2, 0.5));
    }
    
    // Apply banking
    const bankAngle = trackTilt;
    if (Math.abs(bankAngle) > 0.001) {
      // Rotate up vector around tangent
      const cos = Math.cos(bankAngle);
      const sin = Math.sin(bankAngle);
      const right = tangent.cross(up).normalize();
      up = up.scale(cos).add(right.scale(sin));
    }
    
    up = up.normalize();
    const binormal = tangent.cross(up).normalize();
    const normal = binormal.cross(tangent).normalize();
    
    // Torsion (rate of twist)
    const torsion = 0; // Would need third derivative for accurate torsion
    
    // Arc length
    const arcLength = t * this.totalLength;
    
    return {
      position,
      tangent,
      normal,
      binormal,
      curvature,
      torsion,
      grade,
      bankAngle,
      arcLength,
    };
  }
  
  /**
   * Get track sample at normalized progress (0-1)
   */
  getSampleAtProgress(progress: number): TrackSample {
    progress = Math.max(0, Math.min(1, progress));
    
    // Use precomputed samples with interpolation
    if (this.samples.length > 0) {
      const idx = progress * (this.samples.length - 1);
      const i = Math.floor(idx);
      const frac = idx - i;
      
      if (i >= this.samples.length - 1) {
        return this.samples[this.samples.length - 1];
      }
      
      const s1 = this.samples[i];
      const s2 = this.samples[i + 1];
      
      return {
        position: s1.position.lerp(s2.position, frac),
        tangent: s1.tangent.lerp(s2.tangent, frac).normalize(),
        normal: s1.normal.lerp(s2.normal, frac).normalize(),
        binormal: s1.binormal.lerp(s2.binormal, frac).normalize(),
        curvature: s1.curvature + (s2.curvature - s1.curvature) * frac,
        torsion: s1.torsion + (s2.torsion - s1.torsion) * frac,
        grade: s1.grade + (s2.grade - s1.grade) * frac,
        bankAngle: s1.bankAngle + (s2.bankAngle - s1.bankAngle) * frac,
        arcLength: s1.arcLength + (s2.arcLength - s1.arcLength) * frac,
      };
    }
    
    return this.sampleAt(progress);
  }
  
  /**
   * Convert arc length to progress (0-1)
   */
  arcLengthToProgress(arcLength: number): number {
    if (this.totalLength <= 0) return 0;
    return Math.max(0, Math.min(1, arcLength / this.totalLength));
  }
  
  /**
   * Get total track length in meters
   */
  getTotalLength(): number {
    return this.totalLength;
  }
  
  /**
   * Check if track is looped
   */
  getIsLooped(): boolean {
    return this.isLooped;
  }
}

// =============================================================================
// Physics State
// =============================================================================

export interface PhysicsState {
  // Position and motion
  position: Vec3;
  velocity: Vec3;
  speed: number;           // m/s (scalar)
  progress: number;        // 0-1 along track
  arcLength: number;       // meters traveled
  
  // Forces and accelerations
  acceleration: Vec3;
  netForce: Vec3;
  
  // G-forces (in car's reference frame)
  gForceVertical: number;  // Positive = pushed into seat
  gForceLateral: number;   // Positive = pushed right
  gForceLongitudinal: number; // Positive = pushed back
  gForceTotal: number;     // Magnitude
  
  // Track geometry at current position
  trackSample: TrackSample;
  
  // State flags
  isOnChainLift: boolean;
  isInLoop: boolean;
  isBraking: boolean;
  isAirtime: boolean;      // Negative vertical G
  
  // Energy (for validation)
  kineticEnergy: number;   // Joules
  potentialEnergy: number; // Joules
  totalEnergy: number;     // Joules (should be roughly conserved)
}

// =============================================================================
// Main Physics Engine
// =============================================================================

export class RollerCoasterPhysics {
  private spline: TrackSpline | null = null;
  private state: PhysicsState;
  private mass: number;
  private hasChainLift: boolean = false;
  private chainLiftEndProgress: number = 0.2;
  
  constructor() {
    this.mass = PHYSICS_CONSTANTS.CAR_MASS + 
                PHYSICS_CONSTANTS.PASSENGER_MASS * PHYSICS_CONSTANTS.PASSENGERS;
    
    this.state = this.createDefaultState();
  }
  
  private createDefaultState(): PhysicsState {
    return {
      position: new Vec3(),
      velocity: new Vec3(),
      speed: 0,
      progress: 0,
      arcLength: 0,
      acceleration: new Vec3(),
      netForce: new Vec3(),
      gForceVertical: 1.0,
      gForceLateral: 0,
      gForceLongitudinal: 0,
      gForceTotal: 1.0,
      trackSample: {
        position: new Vec3(),
        tangent: new Vec3(1, 0, 0),
        normal: new Vec3(0, 1, 0),
        binormal: new Vec3(0, 0, 1),
        curvature: 0,
        torsion: 0,
        grade: 0,
        bankAngle: 0,
        arcLength: 0,
      },
      isOnChainLift: false,
      isInLoop: false,
      isBraking: false,
      isAirtime: false,
      kineticEnergy: 0,
      potentialEnergy: 0,
      totalEnergy: 0,
    };
  }
  
  /**
   * Initialize track from points
   */
  setTrack(trackPoints: TrackPointInput[], isLooped: boolean = false): void {
    if (trackPoints.length < 2) {
      this.spline = null;
      return;
    }
    
    this.spline = new TrackSpline(trackPoints, isLooped);
    
    // Find chain lift end (first peak or 20% of track)
    if (this.hasChainLift && trackPoints.length > 2) {
      let maxHeight = trackPoints[0].position.y;
      let maxIndex = 0;
      
      for (let i = 1; i < Math.min(trackPoints.length, Math.floor(trackPoints.length * 0.5)); i++) {
        if (trackPoints[i].position.y > maxHeight) {
          maxHeight = trackPoints[i].position.y;
          maxIndex = i;
        }
      }
      
      this.chainLiftEndProgress = (maxIndex + 1) / trackPoints.length;
    }
  }
  
  /**
   * Enable/disable chain lift
   */
  setChainLift(enabled: boolean): void {
    this.hasChainLift = enabled;
  }
  
  /**
   * Reset to start of track
   */
  reset(): void {
    this.state = this.createDefaultState();
    
    if (this.spline) {
      const sample = this.spline.getSampleAtProgress(0);
      this.state.position = sample.position;
      this.state.trackSample = sample;
      this.state.potentialEnergy = this.mass * PHYSICS_CONSTANTS.GRAVITY * sample.position.y;
      this.state.totalEnergy = this.state.potentialEnergy;
    }
  }
  
  /**
   * Set progress directly (for external control)
   */
  setProgress(progress: number): void {
    if (!this.spline) return;
    
    this.state.progress = Math.max(0, Math.min(1, progress));
    this.state.arcLength = this.state.progress * this.spline.getTotalLength();
    this.state.trackSample = this.spline.getSampleAtProgress(this.state.progress);
    this.state.position = this.state.trackSample.position;
  }
  
  /**
   * Set speed directly
   */
  setSpeed(speed: number): void {
    this.state.speed = Math.max(0, Math.min(PHYSICS_CONSTANTS.MAX_SPEED, speed));
    
    if (this.spline && this.state.trackSample) {
      this.state.velocity = this.state.trackSample.tangent.scale(this.state.speed);
    }
    
    this.state.kineticEnergy = 0.5 * this.mass * this.state.speed * this.state.speed;
    this.updateTotalEnergy();
  }
  
  private updateTotalEnergy(): void {
    this.state.totalEnergy = this.state.kineticEnergy + this.state.potentialEnergy;
  }
  
  /**
   * Calculate all forces acting on the car
   */
  private calculateForces(sample: TrackSample, speed: number): {
    gravity: Vec3;
    drag: Vec3;
    friction: Vec3;
    normal: Vec3;
    centripetal: Vec3;
    chainLift: Vec3;
  } {
    const g = PHYSICS_CONSTANTS.GRAVITY;
    
    // Gravity force (always downward)
    const gravity = new Vec3(0, -this.mass * g, 0);
    
    // Air drag (proportional to v²)
    const dragMagnitude = 0.5 * PHYSICS_CONSTANTS.AIR_DENSITY * 
                          PHYSICS_CONSTANTS.CAR_FRONTAL_AREA *
                          PHYSICS_CONSTANTS.CAR_DRAG_COEFFICIENT *
                          speed * speed;
    const drag = sample.tangent.scale(-dragMagnitude * Math.sign(speed));
    
    // Rolling friction
    const normalForce = this.mass * g * Math.cos(Math.atan(sample.grade / 100));
    const frictionMagnitude = PHYSICS_CONSTANTS.ROLLING_RESISTANCE_COEF * normalForce;
    const friction = sample.tangent.scale(-frictionMagnitude * Math.sign(speed));
    
    // Normal force from track (reaction)
    const normal = sample.normal.scale(normalForce);
    
    // Centripetal force required for curved path
    const centripetalAccel = speed * speed * sample.curvature;
    const centripetal = sample.normal.scale(-this.mass * centripetalAccel);
    
    // Chain lift force
    let chainLift = new Vec3();
    if (this.state.isOnChainLift) {
      // Force needed to maintain chain lift speed on incline
      const inclineAngle = Math.atan(sample.grade / 100);
      const requiredForce = this.mass * g * Math.sin(inclineAngle) + 
                            frictionMagnitude + dragMagnitude;
      chainLift = sample.tangent.scale(Math.max(0, requiredForce));
    }
    
    return { gravity, drag, friction, normal, centripetal, chainLift };
  }
  
  /**
   * Calculate G-forces experienced by rider
   */
  private calculateGForces(
    acceleration: Vec3, 
    sample: TrackSample, 
    speed: number
  ): { vertical: number; lateral: number; longitudinal: number } {
    const g = PHYSICS_CONSTANTS.GRAVITY;
    
    // Centripetal acceleration from track curvature
    const centripetalAccel = speed * speed * sample.curvature;
    
    // Total acceleration in world frame
    const totalAccel = acceleration.clone();
    
    // Transform to car's reference frame
    // Vertical G (normal to track, positive = pushed into seat)
    // This includes gravity component + centripetal + normal acceleration
    const gravityComponent = g * Math.cos(sample.bankAngle);
    const centripetalComponent = centripetalAccel;
    const verticalG = (gravityComponent + centripetalComponent) / g;
    
    // Lateral G (sideways, positive = pushed right)
    // From banking and lateral curves
    const lateralCurveAccel = speed * speed * sample.curvature * Math.sin(sample.bankAngle);
    const lateralG = lateralCurveAccel / g;
    
    // Longitudinal G (forward/back, positive = pushed back)
    // From acceleration/deceleration along track
    const tangentAccel = totalAccel.dot(sample.tangent);
    const longitudinalG = -tangentAccel / g;
    
    return {
      vertical: Math.max(PHYSICS_CONSTANTS.MIN_VERTICAL_G, 
                         Math.min(PHYSICS_CONSTANTS.MAX_VERTICAL_G, verticalG)),
      lateral: Math.max(-PHYSICS_CONSTANTS.MAX_LATERAL_G, 
                        Math.min(PHYSICS_CONSTANTS.MAX_LATERAL_G, lateralG)),
      longitudinal: longitudinalG,
    };
  }
  
  /**
   * Simulate one physics step
   */
  step(dt: number): PhysicsState {
    if (!this.spline || this.spline.getTotalLength() <= 0) {
      return this.state;
    }
    
    // Clamp dt to prevent instability
    dt = Math.min(dt, 0.05);
    
    // Subdivide for accuracy
    const substeps = PHYSICS_CONSTANTS.PHYSICS_SUBSTEPS;
    const subDt = dt / substeps;
    
    for (let i = 0; i < substeps; i++) {
      this.stepInternal(subDt);
    }
    
    return this.state;
  }
  
  private stepInternal(dt: number): void {
    if (!this.spline) return;
    
    const sample = this.spline.getSampleAtProgress(this.state.progress);
    this.state.trackSample = sample;
    this.state.position = sample.position;
    
    // Check if on chain lift
    this.state.isOnChainLift = this.hasChainLift && 
                                this.state.progress < this.chainLiftEndProgress;
    
    // Check if in loop (high curvature + going up)
    this.state.isInLoop = sample.curvature > 0.1 && sample.grade > 20;
    
    let speed = this.state.speed;
    
    if (this.state.isOnChainLift) {
      // Chain lift: accelerate to chain speed then maintain
      const targetSpeed = PHYSICS_CONSTANTS.CHAIN_LIFT_SPEED;
      if (speed < targetSpeed) {
        speed = Math.min(speed + PHYSICS_CONSTANTS.CHAIN_LIFT_ACCELERATION * dt, targetSpeed);
      } else {
        speed = targetSpeed;
      }
    } else {
      // Normal physics
      const forces = this.calculateForces(sample, speed);
      
      // Net force along track direction
      const netForce = forces.gravity
        .add(forces.drag)
        .add(forces.friction)
        .add(forces.chainLift);
      
      this.state.netForce = netForce;
      
      // Component of net force along track (tangential)
      const tangentialForce = netForce.dot(sample.tangent);
      
      // Acceleration along track
      const tangentialAccel = tangentialForce / this.mass;
      
      // Update speed using semi-implicit Euler
      speed = speed + tangentialAccel * dt;
      
      // Energy conservation check and correction
      const currentPE = this.mass * PHYSICS_CONSTANTS.GRAVITY * sample.position.y;
      const currentKE = 0.5 * this.mass * speed * speed;
      const currentTotal = currentPE + currentKE;
      
      // Allow some energy loss from friction/drag, but prevent gain
      if (currentTotal > this.state.totalEnergy * 1.01) {
        // Energy increased too much, correct speed
        const maxKE = this.state.totalEnergy - currentPE;
        if (maxKE > 0) {
          speed = Math.sqrt(2 * maxKE / this.mass);
        }
      }
      
      // Update total energy (allow gradual loss)
      this.state.totalEnergy = Math.min(this.state.totalEnergy, currentTotal);
    }
    
    // Clamp speed
    speed = Math.max(PHYSICS_CONSTANTS.MIN_SPEED, 
                     Math.min(PHYSICS_CONSTANTS.MAX_SPEED, speed));
    
    this.state.speed = speed;
    this.state.velocity = sample.tangent.scale(speed);
    
    // Update position along track
    const distanceTraveled = speed * dt;
    this.state.arcLength += distanceTraveled;
    this.state.progress = this.spline.arcLengthToProgress(this.state.arcLength);
    
    // Handle looped track
    if (this.spline.getIsLooped() && this.state.progress >= 1) {
      this.state.progress = this.state.progress % 1;
      this.state.arcLength = this.state.arcLength % this.spline.getTotalLength();
    }
    
    // Calculate acceleration for G-forces
    this.state.acceleration = sample.tangent.scale(
      (speed - this.state.speed) / Math.max(dt, 0.001)
    );
    
    // Calculate G-forces
    const gForces = this.calculateGForces(this.state.acceleration, sample, speed);
    this.state.gForceVertical = gForces.vertical;
    this.state.gForceLateral = gForces.lateral;
    this.state.gForceLongitudinal = gForces.longitudinal;
    this.state.gForceTotal = Math.sqrt(
      gForces.vertical * gForces.vertical +
      gForces.lateral * gForces.lateral +
      gForces.longitudinal * gForces.longitudinal
    );
    
    // Airtime detection
    this.state.isAirtime = this.state.gForceVertical < 0.5;
    
    // Update energy values
    this.state.kineticEnergy = 0.5 * this.mass * speed * speed;
    this.state.potentialEnergy = this.mass * PHYSICS_CONSTANTS.GRAVITY * sample.position.y;
  }
  
  /**
   * Get current physics state
   */
  getState(): PhysicsState {
    return { ...this.state };
  }
  
  /**
   * Get speed in various units
   */
  getSpeeds(): { ms: number; kmh: number; mph: number } {
    return {
      ms: this.state.speed,
      kmh: this.state.speed * 3.6,
      mph: this.state.speed * 2.23694,
    };
  }
}

// =============================================================================
// Track Validator
// =============================================================================

export interface ValidationIssue {
  type: 'error' | 'warning' | 'info';
  message: string;
  pointIndex?: number;
  value?: number;
}

export function validateTrack(
  trackPoints: TrackPointInput[],
  isLooped: boolean
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  
  if (trackPoints.length < 2) {
    issues.push({
      type: 'error',
      message: 'Track needs at least 2 points',
    });
    return issues;
  }
  
  // Create physics simulation
  const physics = new RollerCoasterPhysics();
  physics.setTrack(trackPoints, isLooped);
  physics.setChainLift(true);
  physics.reset();
  physics.setSpeed(1);
  
  // Simulate and check for issues
  const dt = 0.016; // 60fps
  const maxSteps = 10000;
  let step = 0;
  
  let maxVerticalG = 0;
  let minVerticalG = Infinity;
  let maxLateralG = 0;
  let maxSpeed = 0;
  let minSpeed = Infinity;
  let minHeight = Infinity;
  let maxGPoint = 0;
  let lowSpeedPoint = -1;
  
  const startProgress = physics.getState().progress;
  
  while (step < maxSteps) {
    physics.step(dt);
    const state = physics.getState();
    
    // Track extremes
    if (state.gForceVertical > maxVerticalG) {
      maxVerticalG = state.gForceVertical;
      maxGPoint = state.progress;
    }
    if (state.gForceVertical < minVerticalG) {
      minVerticalG = state.gForceVertical;
    }
    if (Math.abs(state.gForceLateral) > maxLateralG) {
      maxLateralG = Math.abs(state.gForceLateral);
    }
    if (state.speed > maxSpeed) {
      maxSpeed = state.speed;
    }
    if (state.speed < minSpeed) {
      minSpeed = state.speed;
      lowSpeedPoint = state.progress;
    }
    if (state.position.y < minHeight) {
      minHeight = state.position.y;
    }
    
    // Check for completion
    if (!isLooped && state.progress >= 0.99) break;
    if (isLooped && step > 100 && Math.abs(state.progress - startProgress) < 0.01) break;
    
    step++;
  }
  
  // Generate issues based on simulation
  if (maxVerticalG > 4.0) {
    issues.push({
      type: 'error',
      message: `Extreme positive G-force: ${maxVerticalG.toFixed(1)}G (unsafe > 4G)`,
      value: maxVerticalG,
    });
  } else if (maxVerticalG > 3.5) {
    issues.push({
      type: 'warning',
      message: `High positive G-force: ${maxVerticalG.toFixed(1)}G`,
      value: maxVerticalG,
    });
  }
  
  if (minVerticalG < -1.0) {
    issues.push({
      type: 'warning',
      message: `Strong negative G-force (airtime): ${minVerticalG.toFixed(1)}G`,
      value: minVerticalG,
    });
  }
  
  if (maxLateralG > 1.5) {
    issues.push({
      type: 'error',
      message: `Excessive lateral G-force: ${maxLateralG.toFixed(1)}G (unsafe > 1.5G)`,
      value: maxLateralG,
    });
  } else if (maxLateralG > 1.2) {
    issues.push({
      type: 'warning',
      message: `High lateral G-force: ${maxLateralG.toFixed(1)}G`,
      value: maxLateralG,
    });
  }
  
  if (maxSpeed > 45) {
    issues.push({
      type: 'warning',
      message: `Very high speed: ${(maxSpeed * 3.6).toFixed(0)} km/h`,
      value: maxSpeed,
    });
  }
  
  if (minSpeed < 0.5 && lowSpeedPoint > 0.1) {
    issues.push({
      type: 'error',
      message: `Car may stall at ${(lowSpeedPoint * 100).toFixed(0)}% - not enough speed`,
      value: minSpeed,
    });
  }
  
  if (minHeight < 0.5) {
    issues.push({
      type: 'error',
      message: 'Track goes underground or too close to ground',
      value: minHeight,
    });
  }
  
  // Check for sudden direction changes
  for (let i = 1; i < trackPoints.length - 1; i++) {
    const p1 = Vec3.from(trackPoints[i - 1].position);
    const p2 = Vec3.from(trackPoints[i].position);
    const p3 = Vec3.from(trackPoints[i + 1].position);
    
    const v1 = p2.sub(p1).normalize();
    const v2 = p3.sub(p2).normalize();
    
    const angle = Math.acos(Math.max(-1, Math.min(1, v1.dot(v2))));
    const angleDeg = angle * 180 / Math.PI;
    
    if (angleDeg > 90) {
      issues.push({
        type: 'error',
        message: `Sharp turn at point ${i + 1}: ${angleDeg.toFixed(0)}°`,
        pointIndex: i,
        value: angleDeg,
      });
    } else if (angleDeg > 60) {
      issues.push({
        type: 'warning',
        message: `Tight turn at point ${i + 1}: ${angleDeg.toFixed(0)}°`,
        pointIndex: i,
        value: angleDeg,
      });
    }
  }
  
  // Check for steep drops
  for (let i = 0; i < trackPoints.length - 1; i++) {
    const h1 = trackPoints[i].position.y;
    const h2 = trackPoints[i + 1].position.y;
    const p1 = Vec3.from(trackPoints[i].position);
    const p2 = Vec3.from(trackPoints[i + 1].position);
    
    const horizontalDist = new Vec3(
      p2.x - p1.x,
      0,
      p2.z - p1.z
    ).length();
    
    if (horizontalDist > 0.1) {
      const grade = Math.abs((h2 - h1) / horizontalDist) * 100;
      
      if (grade > 100) {
        issues.push({
          type: 'warning',
          message: `Very steep section ${i + 1}-${i + 2}: ${grade.toFixed(0)}% grade`,
          pointIndex: i,
          value: grade,
        });
      }
    }
  }
  
  if (issues.length === 0) {
    issues.push({
      type: 'info',
      message: `Track validated: max ${maxVerticalG.toFixed(1)}G, top speed ${(maxSpeed * 3.6).toFixed(0)} km/h`,
    });
  }
  
  return issues;
}
