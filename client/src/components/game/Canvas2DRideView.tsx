/**
 * Canvas2DRideView Component
 * 
 * A WebGL-free ride experience using HTML5 Canvas 2D
 * Provides a side-view and first-person visualization of the ride
 * Uses the pure JavaScript physics engine
 * 
 * Features:
 * - Day/Night mode support with dynamic sky
 * - Enhanced visual effects (stars, motion blur, particles)
 * - Real-time G-force visualization
 * - Atmospheric lighting effects
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { useRollerCoaster, TrackPoint } from '@/lib/stores/useRollerCoaster';
import { 
  RollerCoasterPhysics, 
  TrackSpline, 
  TrackPointInput,
  PHYSICS_CONSTANTS,
} from '@/lib/physics/PhysicsEngine';

interface Canvas2DRideViewProps {
  onExit?: () => void;
}

// Convert track points for physics
function convertTrackPoints(trackPoints: TrackPoint[]): TrackPointInput[] {
  return trackPoints.map(p => ({
    position: { x: p.position.x, y: p.position.y, z: p.position.z },
    tilt: p.tilt,
    hasLoop: p.hasLoop,
  }));
}

// Star system for night mode
interface Star {
  x: number;
  y: number;
  size: number;
  brightness: number;
  twinkleSpeed: number;
  twinklePhase: number;
}

function generateStars(count: number, width: number, height: number): Star[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height * 0.5,
    size: Math.random() * 2 + 0.5,
    brightness: Math.random() * 0.5 + 0.5,
    twinkleSpeed: Math.random() * 2 + 0.5,
    twinklePhase: Math.random() * Math.PI * 2,
  }));
}

// Color utilities with enhanced aesthetics
function gForceToColor(g: number): string {
  if (g < 0) return `hsl(280, 85%, ${55 + Math.min(Math.abs(g) * 15, 25)}%)`; // Purple for negative (airtime)
  if (g < 1) return `hsl(${160 - g * 40}, 75%, 55%)`; // Cyan to green
  if (g < 1.5) return `hsl(${120 - (g - 1) * 60}, 75%, 55%)`; // Green to yellow-green
  if (g < 2.5) return `hsl(${60 - (g - 1.5) * 30}, 80%, 55%)`; // Yellow to orange
  if (g < 4) return `hsl(${30 - (g - 2.5) * 20}, 85%, 50%)`; // Orange to red
  return `hsl(0, 90%, ${55 - Math.min((g - 4) * 8, 15)}%)`; // Deep red
}

function speedToColor(speed: number, maxSpeed: number): string {
  const ratio = speed / maxSpeed;
  if (ratio < 0.2) return '#06b6d4'; // Cyan (slow)
  if (ratio < 0.4) return '#10b981'; // Green
  if (ratio < 0.6) return '#f59e0b'; // Amber
  if (ratio < 0.8) return '#f97316'; // Orange
  return '#ef4444'; // Red (fast)
}

function heightToGradient(height: number, maxHeight: number, isNight: boolean): string {
  const ratio = Math.min(height / Math.max(maxHeight, 30), 1);
  if (isNight) {
    return `hsl(${250 + ratio * 20}, ${50 + ratio * 30}%, ${10 + ratio * 15}%)`;
  }
  return `hsl(${200 + ratio * 20}, ${60 + ratio * 20}%, ${40 + ratio * 30}%)`;
}

export function Canvas2DRideView({ onExit }: Canvas2DRideViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fpvCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { trackPoints, isLooped, hasChainLift, stopRide, isRiding, isNightMode } = useRollerCoaster();
  
  const [physicsData, setPhysicsData] = useState({
    speed: 0,
    speedKmh: 0,
    speedMph: 0,
    gForceVertical: 1,
    gForceLateral: 0,
    gForceTotal: 1,
    height: 0,
    progress: 0,
    isOnChainLift: false,
    isAirtime: false,
  });
  
  const physicsRef = useRef<RollerCoasterPhysics | null>(null);
  const splineRef = useRef<TrackSpline | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef(performance.now());
  const starsRef = useRef<Star[]>([]);
  const timeRef = useRef(0);
  
  // Keyboard handler for ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopRide();
        onExit?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stopRide, onExit]);
  
  // Initialize physics and track
  useEffect(() => {
    if (trackPoints.length < 2) return;
    
    const points = convertTrackPoints(trackPoints);
    
    physicsRef.current = new RollerCoasterPhysics();
    physicsRef.current.setTrack(points, isLooped);
    physicsRef.current.setChainLift(hasChainLift);
    physicsRef.current.reset();
    physicsRef.current.setSpeed(1);
    
    splineRef.current = new TrackSpline(points, isLooped);
    
    return () => {
      physicsRef.current = null;
      splineRef.current = null;
    };
  }, [trackPoints, isLooped, hasChainLift]);
  
  // Draw side view of track with enhanced visuals
  const drawSideView = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!splineRef.current || trackPoints.length < 2) return;
    
    ctx.clearRect(0, 0, width, height);
    
    // Calculate bounds
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const p of trackPoints) {
      minX = Math.min(minX, p.position.x, p.position.z);
      maxX = Math.max(maxX, p.position.x, p.position.z);
      minY = Math.min(minY, p.position.y);
      maxY = Math.max(maxY, p.position.y);
    }
    
    // Add padding
    const padX = (maxX - minX) * 0.1 || 10;
    const padY = (maxY - minY) * 0.2 || 5;
    minX -= padX;
    maxX += padX;
    minY -= padY;
    maxY += padY;
    
    // Ensure minimum range
    if (maxY - minY < 10) {
      maxY = minY + 10;
    }
    
    // Scale functions
    const scaleX = (v: number) => ((v - minX) / (maxX - minX)) * (width - 40) + 20;
    const scaleY = (v: number) => height - 30 - ((v - minY) / (maxY - minY)) * (height - 60);
    
    // Enhanced background gradient based on day/night
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    if (isNightMode) {
      bgGrad.addColorStop(0, '#0c0a1e');
      bgGrad.addColorStop(0.3, '#1a1635');
      bgGrad.addColorStop(0.7, '#0f172a');
      bgGrad.addColorStop(1, '#0a0f1a');
    } else {
      bgGrad.addColorStop(0, '#1e3a5f');
      bgGrad.addColorStop(0.5, '#2d4a6f');
      bgGrad.addColorStop(1, '#1e293b');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);
    
    // Draw stars in night mode
    if (isNightMode) {
      if (starsRef.current.length === 0 || starsRef.current[0]?.x > width) {
        starsRef.current = generateStars(80, width, height);
      }
      
      for (const star of starsRef.current) {
        const twinkle = Math.sin(timeRef.current * star.twinkleSpeed + star.twinklePhase) * 0.3 + 0.7;
        const brightness = star.brightness * twinkle;
        
        ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
        
        // Star glow
        if (star.size > 1.5) {
          const glowGrad = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.size * 3);
          glowGrad.addColorStop(0, `rgba(200, 220, 255, ${brightness * 0.3})`);
          glowGrad.addColorStop(1, 'rgba(200, 220, 255, 0)');
          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
      // Moon in night mode
      const moonX = width * 0.85;
      const moonY = height * 0.15;
      const moonRadius = 15;
      
      const moonGlow = ctx.createRadialGradient(moonX, moonY, moonRadius * 0.5, moonX, moonY, moonRadius * 4);
      moonGlow.addColorStop(0, 'rgba(255, 255, 230, 0.4)');
      moonGlow.addColorStop(0.5, 'rgba(255, 255, 230, 0.1)');
      moonGlow.addColorStop(1, 'rgba(255, 255, 230, 0)');
      ctx.fillStyle = moonGlow;
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonRadius * 4, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#fffbe6';
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
      ctx.fill();
      
      // Moon craters
      ctx.fillStyle = 'rgba(200, 200, 180, 0.3)';
      ctx.beginPath();
      ctx.arc(moonX - 5, moonY - 3, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(moonX + 4, moonY + 4, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Sun in day mode
      const sunX = width * 0.85;
      const sunY = height * 0.15;
      const sunRadius = 12;
      
      const sunGlow = ctx.createRadialGradient(sunX, sunY, sunRadius * 0.5, sunX, sunY, sunRadius * 6);
      sunGlow.addColorStop(0, 'rgba(255, 230, 120, 0.6)');
      sunGlow.addColorStop(0.3, 'rgba(255, 200, 100, 0.3)');
      sunGlow.addColorStop(1, 'rgba(255, 180, 80, 0)');
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunRadius * 6, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#fcd34d';
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Draw enhanced grid
    ctx.strokeStyle = isNightMode ? 'rgba(100, 120, 180, 0.08)' : 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1;
    
    // Horizontal grid lines (height markers)
    for (let y = Math.ceil(minY / 5) * 5; y <= maxY; y += 5) {
      const sy = scaleY(y);
      ctx.beginPath();
      ctx.moveTo(20, sy);
      ctx.lineTo(width - 20, sy);
      ctx.stroke();
      
      // Height label
      ctx.fillStyle = isNightMode ? 'rgba(180, 180, 220, 0.5)' : 'rgba(148, 163, 184, 0.6)';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${y}m`, 18, sy + 3);
    }
    
    // Enhanced ground with gradient
    const groundY = scaleY(0);
    const groundGrad = ctx.createLinearGradient(0, groundY, 0, height);
    if (isNightMode) {
      groundGrad.addColorStop(0, 'rgba(34, 80, 60, 0.4)');
      groundGrad.addColorStop(0.5, 'rgba(20, 50, 40, 0.6)');
      groundGrad.addColorStop(1, 'rgba(10, 30, 25, 0.8)');
    } else {
      groundGrad.addColorStop(0, 'rgba(34, 197, 94, 0.3)');
      groundGrad.addColorStop(0.5, 'rgba(22, 163, 74, 0.4)');
      groundGrad.addColorStop(1, 'rgba(21, 128, 61, 0.5)');
    }
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, groundY, width, height - groundY);
    
    // Ground line with glow
    ctx.shadowColor = isNightMode ? '#22c55e' : '#4ade80';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = isNightMode ? '#16a34a' : '#22c55e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(width, groundY);
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Draw track with G-force coloring and glow effects
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const segments = 200;
    let prevX = 0, prevY = 0;
    
    // Track shadow/glow layer
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const sample = splineRef.current.getSampleAtProgress(t);
      
      const horizontalPos = Math.sqrt(
        sample.position.x * sample.position.x + 
        sample.position.z * sample.position.z
      ) * Math.sign(sample.position.x || sample.position.z || 1);
      
      const sx = scaleX(horizontalPos);
      const sy = scaleY(sample.position.y);
      
      if (i > 0) {
        const estimatedG = 1 + sample.curvature * 10;
        const color = gForceToColor(estimatedG);
        
        // Glow effect
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = color;
        ctx.lineWidth = 6;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(sx, sy);
        ctx.stroke();
        
        // Main track
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }
      
      prevX = sx;
      prevY = sy;
    }
    
    ctx.shadowBlur = 0;
    
    // Draw track points with enhanced styling
    for (let i = 0; i < trackPoints.length; i++) {
      const p = trackPoints[i];
      const horizontalPos = Math.sqrt(p.position.x ** 2 + p.position.z ** 2) * 
        Math.sign(p.position.x || p.position.z || 1);
      
      const sx = scaleX(horizontalPos);
      const sy = scaleY(p.position.y);
      
      // Point glow
      const pointGlow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 12);
      pointGlow.addColorStop(0, 'rgba(96, 165, 250, 0.4)');
      pointGlow.addColorStop(1, 'rgba(96, 165, 250, 0)');
      ctx.fillStyle = pointGlow;
      ctx.beginPath();
      ctx.arc(sx, sy, 12, 0, Math.PI * 2);
      ctx.fill();
      
      // Point body
      ctx.fillStyle = '#60a5fa';
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Point label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${i + 1}`, sx, sy - 12);
    }
    
    // Draw car position with enhanced effects
    if (physicsRef.current) {
      const state = physicsRef.current.getState();
      const sample = splineRef.current.getSampleAtProgress(state.progress);
      
      const horizontalPos = Math.sqrt(
        sample.position.x ** 2 + sample.position.z ** 2
      ) * Math.sign(sample.position.x || sample.position.z || 1);
      
      const carX = scaleX(horizontalPos);
      const carY = scaleY(sample.position.y);
      
      // Speed trail effect
      if (state.speed > 3) {
        const trailLength = Math.min(state.speed * 2, 40);
        const angle = Math.atan2(-sample.tangent.y, 
          Math.sqrt(sample.tangent.x ** 2 + sample.tangent.z ** 2) * 
          Math.sign(sample.tangent.x || sample.tangent.z || 1));
        
        const trailGrad = ctx.createLinearGradient(
          carX - Math.cos(angle) * trailLength,
          carY - Math.sin(angle) * trailLength,
          carX, carY
        );
        trailGrad.addColorStop(0, 'rgba(251, 191, 36, 0)');
        trailGrad.addColorStop(1, 'rgba(251, 191, 36, 0.6)');
        
        ctx.strokeStyle = trailGrad;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(carX - Math.cos(angle) * trailLength, carY - Math.sin(angle) * trailLength);
        ctx.lineTo(carX, carY);
        ctx.stroke();
      }
      
      // Car outer glow (pulsing based on G-force)
      const glowIntensity = 0.4 + Math.abs(state.gForceVertical - 1) * 0.1;
      const glowSize = 25 + Math.abs(state.gForceVertical - 1) * 5;
      
      const glowGrad = ctx.createRadialGradient(carX, carY, 0, carX, carY, glowSize);
      glowGrad.addColorStop(0, `rgba(251, 191, 36, ${glowIntensity})`);
      glowGrad.addColorStop(0.5, 'rgba(251, 191, 36, 0.2)');
      glowGrad.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(carX, carY, glowSize, 0, Math.PI * 2);
      ctx.fill();
      
      // Car body with gradient
      const carGrad = ctx.createRadialGradient(carX - 2, carY - 2, 0, carX, carY, 10);
      carGrad.addColorStop(0, '#fcd34d');
      carGrad.addColorStop(1, '#f59e0b');
      
      ctx.fillStyle = carGrad;
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(carX, carY, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Car highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.arc(carX - 2, carY - 2, 3, 0, Math.PI * 2);
      ctx.fill();
      
      // Direction indicator with glow
      const angle = Math.atan2(-sample.tangent.y, 
        Math.sqrt(sample.tangent.x ** 2 + sample.tangent.z ** 2) * 
        Math.sign(sample.tangent.x || sample.tangent.z || 1));
      
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 6;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(carX, carY);
      ctx.lineTo(
        carX + Math.cos(angle) * 18,
        carY + Math.sin(angle) * 18
      );
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    
  }, [trackPoints, isNightMode]);
  
  // Draw first-person view with enhanced visuals
  const drawFirstPersonView = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!physicsRef.current || !splineRef.current) return;
    
    const state = physicsRef.current.getState();
    const sample = splineRef.current.getSampleAtProgress(state.progress);
    
    ctx.clearRect(0, 0, width, height);
    
    // Dynamic sky gradient based on height and day/night
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
    const heightRatio = Math.min(state.position.y / 40, 1);
    
    if (isNightMode) {
      skyGrad.addColorStop(0, `hsl(250, ${55 + heightRatio * 15}%, ${8 + heightRatio * 8}%)`);
      skyGrad.addColorStop(0.4, `hsl(260, ${45 + heightRatio * 20}%, ${15 + heightRatio * 10}%)`);
      skyGrad.addColorStop(0.7, `hsl(220, ${40 + heightRatio * 15}%, ${20 + heightRatio * 8}%)`);
      skyGrad.addColorStop(1, `hsl(150, 40%, ${15 + heightRatio * 5}%)`);
    } else {
      skyGrad.addColorStop(0, `hsl(210, ${60 + heightRatio * 20}%, ${35 + heightRatio * 25}%)`);
      skyGrad.addColorStop(0.4, `hsl(200, ${55 + heightRatio * 25}%, ${55 + heightRatio * 15}%)`);
      skyGrad.addColorStop(0.7, `hsl(180, ${45 + heightRatio * 20}%, ${60 + heightRatio * 10}%)`);
      skyGrad.addColorStop(1, `hsl(120, 45%, ${35 + heightRatio * 15}%)`);
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);
    
    // Draw stars in night mode
    if (isNightMode) {
      if (starsRef.current.length === 0 || starsRef.current[0]?.x > width) {
        starsRef.current = generateStars(120, width, height);
      }
      
      // Parallax effect based on speed
      const parallax = state.speed * 0.1;
      
      for (const star of starsRef.current) {
        const offsetX = (star.x + timeRef.current * parallax * star.brightness) % width;
        const twinkle = Math.sin(timeRef.current * star.twinkleSpeed + star.twinklePhase) * 0.3 + 0.7;
        const brightness = star.brightness * twinkle;
        
        ctx.fillStyle = `rgba(255, 255, 255, ${brightness * 0.8})`;
        ctx.beginPath();
        ctx.arc(offsetX, star.y, star.size * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Moon in FPV
      const moonX = width * 0.8 - state.speed * 2;
      const moonY = height * 0.12;
      
      const moonGlow = ctx.createRadialGradient(moonX, moonY, 5, moonX, moonY, 40);
      moonGlow.addColorStop(0, 'rgba(255, 255, 230, 0.5)');
      moonGlow.addColorStop(0.5, 'rgba(255, 255, 230, 0.15)');
      moonGlow.addColorStop(1, 'rgba(255, 255, 230, 0)');
      ctx.fillStyle = moonGlow;
      ctx.beginPath();
      ctx.arc(moonX, moonY, 40, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#fffce6';
      ctx.beginPath();
      ctx.arc(moonX, moonY, 12, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Sun in FPV day mode
      const sunX = width * 0.15;
      const sunY = height * 0.1;
      
      const sunGlow = ctx.createRadialGradient(sunX, sunY, 5, sunX, sunY, 60);
      sunGlow.addColorStop(0, 'rgba(255, 240, 150, 0.9)');
      sunGlow.addColorStop(0.2, 'rgba(255, 220, 100, 0.5)');
      sunGlow.addColorStop(0.5, 'rgba(255, 200, 80, 0.2)');
      sunGlow.addColorStop(1, 'rgba(255, 180, 60, 0)');
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 60, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#fcd34d';
      ctx.beginPath();
      ctx.arc(sunX, sunY, 15, 0, Math.PI * 2);
      ctx.fill();
      
      // Sun rays
      ctx.strokeStyle = 'rgba(255, 220, 100, 0.3)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(sunX + Math.cos(angle) * 20, sunY + Math.sin(angle) * 20);
        ctx.lineTo(sunX + Math.cos(angle) * 40, sunY + Math.sin(angle) * 40);
        ctx.stroke();
      }
    }
    
    // Horizon line (tilted based on bank angle)
    const bankAngle = sample.bankAngle;
    const horizonY = height * 0.5 - (sample.tangent.y * height * 0.35);
    
    ctx.save();
    ctx.translate(width / 2, horizonY);
    ctx.rotate(bankAngle);
    
    // Enhanced ground with texture pattern
    const groundGrad = ctx.createLinearGradient(0, 0, 0, height);
    if (isNightMode) {
      groundGrad.addColorStop(0, '#0f4c2e');
      groundGrad.addColorStop(0.5, '#0d3d25');
      groundGrad.addColorStop(1, '#0a2e1c');
    } else {
      groundGrad.addColorStop(0, '#16a34a');
      groundGrad.addColorStop(0.5, '#15803d');
      groundGrad.addColorStop(1, '#166534');
    }
    ctx.fillStyle = groundGrad;
    ctx.fillRect(-width, 0, width * 2, height);
    
    ctx.restore();
    
    // Draw track rails extending forward with enhanced styling
    const centerX = width / 2;
    const vanishY = horizonY;
    const railWidth = 70;
    
    // Draw perspective rails with enhanced visuals
    for (let i = 0; i < 25; i++) {
      const t = i / 25;
      const perspective = Math.pow(1 - t, 2);
      const y = vanishY + (height - vanishY) * t;
      const spread = railWidth * perspective;
      
      // Enhanced cross ties with wood texture
      const tieColor = isNightMode 
        ? `rgba(90, 60, 30, ${0.25 + perspective * 0.7})`
        : `rgba(139, 92, 42, ${0.35 + perspective * 0.65})`;
      ctx.strokeStyle = tieColor;
      ctx.lineWidth = 3 + perspective * 5;
      ctx.beginPath();
      ctx.moveTo(centerX - spread * 1.6, y);
      ctx.lineTo(centerX + spread * 1.6, y);
      ctx.stroke();
      
      // Tie details
      if (perspective > 0.3) {
        ctx.strokeStyle = isNightMode ? 'rgba(60, 40, 20, 0.3)' : 'rgba(100, 65, 25, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(centerX - spread * 1.4, y - 1);
        ctx.lineTo(centerX + spread * 1.4, y - 1);
        ctx.stroke();
      }
    }
    
    // Enhanced rails with metallic effect
    const railGrad = ctx.createLinearGradient(0, vanishY, 0, height);
    if (isNightMode) {
      railGrad.addColorStop(0, '#4a5568');
      railGrad.addColorStop(0.5, '#718096');
      railGrad.addColorStop(1, '#a0aec0');
    } else {
      railGrad.addColorStop(0, '#64748b');
      railGrad.addColorStop(0.5, '#94a3b8');
      railGrad.addColorStop(1, '#cbd5e1');
    }
    
    // Left rail with glow
    ctx.shadowColor = isNightMode ? '#60a5fa' : '#94a3b8';
    ctx.shadowBlur = 4;
    ctx.strokeStyle = railGrad;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(centerX - railWidth, height);
    ctx.lineTo(centerX - 6, vanishY);
    ctx.stroke();
    
    // Right rail
    ctx.beginPath();
    ctx.moveTo(centerX + railWidth, height);
    ctx.lineTo(centerX + 6, vanishY);
    ctx.stroke();
    
    // Rail highlight
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX - railWidth + 2, height);
    ctx.lineTo(centerX - 4, vanishY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX + railWidth - 2, height);
    ctx.lineTo(centerX + 4, vanishY);
    ctx.stroke();
    
    // Enhanced speed lines effect
    if (state.speed > 3) {
      const lineCount = Math.floor(state.speed / 1.5);
      const maxAlpha = Math.min(state.speed / 25, 0.6);
      
      for (let i = 0; i < lineCount; i++) {
        const x = Math.random() * width;
        const y1 = Math.random() * height * 0.4;
        const len = 25 + state.speed * 3;
        
        // Speed line gradient
        const lineGrad = ctx.createLinearGradient(x, y1, x, y1 + len);
        lineGrad.addColorStop(0, `rgba(255, 255, 255, 0)`);
        lineGrad.addColorStop(0.5, `rgba(255, 255, 255, ${maxAlpha})`);
        lineGrad.addColorStop(1, `rgba(255, 255, 255, 0)`);
        
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = Math.random() * 1.5 + 0.5;
        
        ctx.beginPath();
        ctx.moveTo(x, y1);
        ctx.lineTo(x + (x - centerX) * 0.15, y1 + len);
        ctx.stroke();
      }
      
      // Motion blur overlay at high speeds
      if (state.speed > 15) {
        const blurIntensity = (state.speed - 15) / 30;
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(blurIntensity * 0.05, 0.08)})`;
        ctx.fillRect(0, 0, width, height);
      }
    }
    
    // Enhanced G-force visual effects
    if (state.gForceVertical > 2.2) {
      // Tunnel vision effect for high G with red tint
      const intensity = (state.gForceVertical - 2.2) / 2.5;
      const vignetteGrad = ctx.createRadialGradient(
        centerX, height / 2, width * 0.25,
        centerX, height / 2, width * 0.75
      );
      vignetteGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignetteGrad.addColorStop(0.7, `rgba(30, 0, 0, ${Math.min(intensity * 0.3, 0.35)})`);
      vignetteGrad.addColorStop(1, `rgba(0, 0, 0, ${Math.min(intensity * 0.8, 0.75)})`);
      ctx.fillStyle = vignetteGrad;
      ctx.fillRect(0, 0, width, height);
      
      // Pulsing red border
      const pulse = Math.sin(timeRef.current * 8) * 0.15 + 0.85;
      ctx.strokeStyle = `rgba(239, 68, 68, ${intensity * pulse * 0.5})`;
      ctx.lineWidth = 10 + intensity * 15;
      ctx.strokeRect(0, 0, width, height);
    }
    
    if (state.gForceVertical < 0.5) {
      // Enhanced floating/airtime effect
      const floatIntensity = (0.5 - state.gForceVertical) * 2;
      
      // Purple ethereal glow
      const floatGrad = ctx.createRadialGradient(
        centerX, height / 2, 0,
        centerX, height / 2, width * 0.8
      );
      floatGrad.addColorStop(0, `rgba(147, 51, 234, ${floatIntensity * 0.15})`);
      floatGrad.addColorStop(0.5, `rgba(168, 85, 247, ${floatIntensity * 0.1})`);
      floatGrad.addColorStop(1, `rgba(139, 92, 246, ${floatIntensity * 0.05})`);
      ctx.fillStyle = floatGrad;
      ctx.fillRect(0, 0, width, height);
      
      // Floating particles
      if (floatIntensity > 0.3) {
        ctx.fillStyle = `rgba(200, 180, 255, ${floatIntensity * 0.4})`;
        for (let i = 0; i < 15; i++) {
          const px = Math.random() * width;
          const py = (timeRef.current * 50 + i * 40) % height;
          const size = Math.random() * 3 + 1;
          ctx.beginPath();
          ctx.arc(px, height - py, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    
    // Lateral G indicator (screen tilt effect)
    if (Math.abs(state.gForceLateral) > 0.5) {
      const lateralIntensity = Math.abs(state.gForceLateral) - 0.5;
      const side = state.gForceLateral > 0 ? 1 : 0;
      
      const lateralGrad = ctx.createLinearGradient(
        side * width, 0,
        (1 - side) * width, 0
      );
      lateralGrad.addColorStop(0, `rgba(255, 150, 50, ${Math.min(lateralIntensity * 0.2, 0.25)})`);
      lateralGrad.addColorStop(1, 'rgba(255, 150, 50, 0)');
      ctx.fillStyle = lateralGrad;
      ctx.fillRect(0, 0, width, height);
    }
    
  }, [isNightMode]);
  
  // Animation loop
  useEffect(() => {
    if (!isRiding || !physicsRef.current) return;
    
    lastTimeRef.current = performance.now();
    
    const animate = () => {
      if (!physicsRef.current || !isRiding) return;
      
      const now = performance.now();
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = now;
      timeRef.current += dt;
      lastTimeRef.current = now;
      
      // Step physics
      const state = physicsRef.current.step(dt);
      
      // Check for ride completion
      if (!isLooped && state.progress >= 0.99) {
        stopRide();
        return;
      }
      
      // Update physics display
      const speeds = physicsRef.current.getSpeeds();
      setPhysicsData({
        speed: state.speed,
        speedKmh: speeds.kmh,
        speedMph: speeds.mph,
        gForceVertical: state.gForceVertical,
        gForceLateral: state.gForceLateral,
        gForceTotal: state.gForceTotal,
        height: state.position.y,
        progress: state.progress,
        isOnChainLift: state.isOnChainLift,
        isAirtime: state.isAirtime,
      });
      
      // Draw canvases
      const sideCanvas = canvasRef.current;
      const fpvCanvas = fpvCanvasRef.current;
      
      if (sideCanvas) {
        const ctx = sideCanvas.getContext('2d');
        if (ctx) {
          drawSideView(ctx, sideCanvas.width, sideCanvas.height);
        }
      }
      
      if (fpvCanvas) {
        const ctx = fpvCanvas.getContext('2d');
        if (ctx) {
          drawFirstPersonView(ctx, fpvCanvas.width, fpvCanvas.height);
        }
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRiding, isLooped, stopRide, drawSideView, drawFirstPersonView]);
  
  // Handle canvas resize
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      if (!container) return;
      
      const sideCanvas = canvasRef.current;
      const fpvCanvas = fpvCanvasRef.current;
      
      if (sideCanvas) {
        sideCanvas.width = container.clientWidth;
        sideCanvas.height = Math.floor(container.clientHeight * 0.4);
      }
      
      if (fpvCanvas) {
        fpvCanvas.width = container.clientWidth;
        fpvCanvas.height = Math.floor(container.clientHeight * 0.5);
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const handleExit = () => {
    stopRide();
    onExit?.();
  };
  
  if (!isRiding) return null;
  
  const isAirtime = physicsData.gForceVertical < 0.5;
  const isHighG = physicsData.gForceVertical > 2.5;
  
  return (
    <div 
      ref={containerRef}
      className={`fixed inset-0 z-50 flex flex-col transition-colors duration-500 ${
        isNightMode ? 'bg-slate-950' : 'bg-slate-900'
      }`}
    >
      {/* First Person View */}
      <div className="flex-1 relative overflow-hidden">
        <canvas 
          ref={fpvCanvasRef}
          className="w-full h-full"
        />
        
        {/* Atmospheric overlay for night mode */}
        {isNightMode && (
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-purple-900/10 via-transparent to-blue-900/10" />
        )}
        
        {/* Status indicators with enhanced styling */}
        <div className="absolute top-4 left-4 flex gap-3">
          {physicsData.isOnChainLift && (
            <div className="glass-dark text-amber-300 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 border border-amber-500/30 shadow-lg shadow-amber-500/20 animate-pulse">
              <div className="w-2 h-2 bg-amber-400 rounded-full animate-ping" />
              <span className="tracking-wide">⛓️ CHAIN LIFT</span>
            </div>
          )}
          {physicsData.isAirtime && (
            <div className="glass-dark text-purple-300 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 border border-purple-500/30 shadow-lg shadow-purple-500/20">
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
              <span className="tracking-wide">🎢 AIRTIME!</span>
            </div>
          )}
          {isHighG && (
            <div className="glass-dark text-red-300 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 border border-red-500/30 shadow-lg shadow-red-500/20 animate-pulse">
              <div className="w-2 h-2 bg-red-400 rounded-full" />
              <span className="tracking-wide">⚠️ HIGH G-FORCE</span>
            </div>
          )}
        </div>
        
        {/* Exit button with enhanced styling */}
        <button
          onClick={handleExit}
          className="absolute top-4 right-4 glass-dark hover:bg-red-500/30 text-white px-5 py-2.5 rounded-xl font-bold transition-all duration-200 border border-red-500/30 hover:border-red-500/60 shadow-lg hover:shadow-red-500/20 group"
        >
          <span className="group-hover:hidden">EXIT RIDE</span>
          <span className="hidden group-hover:inline">ESC</span>
        </button>
        
        {/* Enhanced G-Force indicator overlay */}
        <div className="absolute bottom-4 left-4 glass-dark rounded-2xl p-4 border border-white/10 shadow-2xl">
          <div className="text-white/70 text-xs mb-2 font-bold tracking-widest">G-FORCE</div>
          <div 
            className="w-24 h-24 rounded-full border-4 relative flex items-center justify-center transition-all duration-150"
            style={{ 
              borderColor: gForceToColor(physicsData.gForceVertical),
              boxShadow: `0 0 20px ${gForceToColor(physicsData.gForceVertical)}40, inset 0 0 20px ${gForceToColor(physicsData.gForceVertical)}20`
            }}
          >
            <div className="text-center">
              <span 
                className="text-3xl font-black"
                style={{ color: gForceToColor(physicsData.gForceVertical) }}
              >
                {physicsData.gForceVertical.toFixed(1)}
              </span>
              <span className="text-white/40 text-lg">G</span>
            </div>
          </div>
          <div className="text-center text-white/50 text-xs mt-2 font-medium">Vertical</div>
          
          {/* Lateral G bar */}
          <div className="mt-3 px-1">
            <div className="text-white/50 text-xs mb-1">Lateral</div>
            <div className="h-2 bg-slate-700 rounded-full relative overflow-hidden">
              <div 
                className="absolute top-0 bottom-0 bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-100"
                style={{ 
                  left: physicsData.gForceLateral < 0 ? `${50 + physicsData.gForceLateral * 25}%` : '50%',
                  width: `${Math.abs(physicsData.gForceLateral) * 25}%`
                }}
              />
              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/30" />
            </div>
            <div className="text-center text-xs mt-1" style={{ color: gForceToColor(Math.abs(physicsData.gForceLateral)) }}>
              {physicsData.gForceLateral.toFixed(2)}G
            </div>
          </div>
        </div>
        
        {/* Enhanced Speed display */}
        <div className="absolute bottom-4 right-4 glass-dark rounded-2xl p-4 text-right border border-white/10 shadow-2xl min-w-[140px]">
          <div className="text-white/70 text-xs mb-1 font-bold tracking-widest">SPEED</div>
          <div 
            className="text-5xl font-black tabular-nums transition-colors duration-150"
            style={{ 
              color: speedToColor(physicsData.speed, PHYSICS_CONSTANTS.MAX_SPEED),
              textShadow: `0 0 20px ${speedToColor(physicsData.speed, PHYSICS_CONSTANTS.MAX_SPEED)}60`
            }}
          >
            {physicsData.speedKmh.toFixed(0)}
          </div>
          <div className="text-white/50 text-sm font-medium">km/h</div>
          <div className="text-white/30 text-xs mt-1 tabular-nums">
            {physicsData.speedMph.toFixed(0)} mph • {physicsData.speed.toFixed(1)} m/s
          </div>
          
          {/* Speed bar */}
          <div className="mt-3 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-100"
              style={{ 
                width: `${Math.min((physicsData.speed / PHYSICS_CONSTANTS.MAX_SPEED) * 100, 100)}%`,
                background: `linear-gradient(90deg, #06b6d4, ${speedToColor(physicsData.speed, PHYSICS_CONSTANTS.MAX_SPEED)})`
              }}
            />
          </div>
        </div>
        
        {/* Enhanced Height indicator */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-4 glass-dark rounded-2xl px-8 py-3 border border-white/10 shadow-2xl">
          <div className="text-white/50 text-xs font-bold tracking-widest text-center">ALTITUDE</div>
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-cyan-400 text-3xl font-black tabular-nums" style={{ textShadow: '0 0 15px rgba(34, 211, 238, 0.4)' }}>
              {physicsData.height.toFixed(1)}
            </span>
            <span className="text-cyan-400/60 text-lg">m</span>
          </div>
          <div className="text-white/30 text-xs text-center mt-0.5">
            {(physicsData.height * 3.28084).toFixed(0)} ft
          </div>
        </div>
      </div>
      
      {/* Enhanced Side View / Track Map */}
      <div className={`h-[32%] border-t-2 relative ${isNightMode ? 'border-purple-900/50' : 'border-slate-700'}`}>
        <canvas 
          ref={canvasRef}
          className="w-full h-full"
        />
        
        {/* Enhanced progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-2 bg-slate-900/80">
          <div 
            className="h-full transition-all duration-100 relative overflow-hidden"
            style={{ 
              width: `${physicsData.progress * 100}%`,
              background: `linear-gradient(90deg, #06b6d4, #8b5cf6, #ec4899)`
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
          </div>
        </div>
        
        <div className="absolute bottom-4 left-4 glass-dark px-3 py-1.5 rounded-lg text-white/60 text-xs font-medium border border-white/5">
          Progress: <span className="text-cyan-400 font-bold">{(physicsData.progress * 100).toFixed(1)}%</span>
        </div>
        
        <div className="absolute top-3 left-4 glass-dark px-3 py-1.5 rounded-lg text-xs font-bold border border-white/5">
          <span className="text-white/80">TRACK VIEW</span>
          <span className="text-emerald-400/80 ml-2">• 2D Mode</span>
          <span className="text-white/40 ml-2">No WebGL Required</span>
        </div>
        
        {/* Day/Night indicator */}
        <div className="absolute top-3 right-4 glass-dark px-3 py-1.5 rounded-lg text-xs font-medium border border-white/5">
          {isNightMode ? (
            <span className="text-purple-300">🌙 Night Mode</span>
          ) : (
            <span className="text-amber-300">☀️ Day Mode</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default Canvas2DRideView;
