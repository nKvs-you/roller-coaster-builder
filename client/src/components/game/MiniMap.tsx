import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import { useRollerCoaster } from '../../lib/stores/useRollerCoaster';
import * as THREE from 'three';
import { CatmullRomCurve3 } from 'three';

interface MiniMapProps {
  size?: number;
  className?: string;
}

// Seeded random for consistent decoration placement
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function MiniMap({ size = 150, className = '' }: MiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { trackPoints, selectedPointId, rideProgress, mode, isNightMode, loopSegments } = useRollerCoaster();
  
  // Pre-generate decorations for the minimap (stable positions)
  const decorations = useMemo(() => {
    const trees: { x: number; z: number; size: number }[] = [];
    const rocks: { x: number; z: number; size: number }[] = [];
    const flowers: { x: number; z: number; color: string }[] = [];
    
    // Trees - outer ring
    for (let i = 0; i < 40; i++) {
      const seed = i * 1337;
      const angle = seededRandom(seed) * Math.PI * 2;
      const radius = 50 + seededRandom(seed + 1) * 150;
      trees.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        size: 2 + seededRandom(seed + 2) * 2
      });
    }
    
    // Rocks scattered around
    for (let i = 0; i < 20; i++) {
      const seed = (i + 500) * 1337;
      const angle = seededRandom(seed) * Math.PI * 2;
      const radius = 30 + seededRandom(seed + 1) * 100;
      rocks.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        size: 1 + seededRandom(seed + 2) * 1.5
      });
    }
    
    // Flower beds
    const colors = ['#E91E63', '#FF9800', '#FFEB3B', '#9C27B0', '#00BCD4'];
    for (let i = 0; i < 15; i++) {
      const seed = (i + 1000) * 1337;
      const angle = seededRandom(seed) * Math.PI * 2;
      const radius = 25 + seededRandom(seed + 1) * 50;
      flowers.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        color: colors[Math.floor(seededRandom(seed + 2) * colors.length)]
      });
    }
    
    return { trees, rocks, flowers };
  }, []);
  
  // Calculate bounds and track data
  const trackData = useMemo(() => {
    if (trackPoints.length < 2) return null;
    
    // Find bounds including decorations
    let minX = -100, maxX = 100;
    let minZ = -100, maxZ = 100;
    
    trackPoints.forEach(point => {
      minX = Math.min(minX, point.position.x - 20);
      maxX = Math.max(maxX, point.position.x + 20);
      minZ = Math.min(minZ, point.position.z - 20);
      maxZ = Math.max(maxZ, point.position.z + 20);
    });
    
    const rangeX = maxX - minX || 1;
    const rangeZ = maxZ - minZ || 1;
    const scale = Math.max(rangeX, rangeZ);
    
    // Create curve for smooth rendering
    const points3D = trackPoints.map(p => 
      new THREE.Vector3(p.position.x, p.position.y, p.position.z)
    );
    
    let curve: CatmullRomCurve3 | null = null;
    if (points3D.length >= 2) {
      curve = new CatmullRomCurve3(points3D, false, 'centripetal', 0.5);
    }
    
    return {
      minX, maxX, minZ, maxZ,
      rangeX, rangeZ, scale,
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
      curve
    };
  }, [trackPoints]);
  
  // Draw on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    
    // Create gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, size, size);
    bgGradient.addColorStop(0, isNightMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(30, 41, 59, 0.9)');
    bgGradient.addColorStop(1, isNightMode ? 'rgba(30, 41, 59, 0.95)' : 'rgba(51, 65, 85, 0.9)');
    ctx.fillStyle = bgGradient;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, 12);
    ctx.fill();
    
    // Gradient border
    const borderGradient = ctx.createLinearGradient(0, 0, size, size);
    borderGradient.addColorStop(0, 'rgba(99, 102, 241, 0.5)');
    borderGradient.addColorStop(0.5, 'rgba(168, 85, 247, 0.5)');
    borderGradient.addColorStop(1, 'rgba(236, 72, 153, 0.5)');
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, 12);
    ctx.stroke();
    
    // Title with icon
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = 'bold 9px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🗺️ MAP', 8, 14);
    
    // Stats badge
    if (trackPoints.length > 0) {
      ctx.fillStyle = 'rgba(99, 102, 241, 0.3)';
      ctx.beginPath();
      ctx.roundRect(size - 35, 4, 30, 14, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = 'bold 8px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${trackPoints.length}pts`, size - 20, 13);
    }
    
    const margin = 20;
    const drawSize = size - margin * 2;
    const defaultScale = 200;
    
    // Transform world coords to canvas coords
    const toCanvas = (x: number, z: number) => {
      if (trackData) {
        const nx = (x - trackData.centerX) / trackData.scale + 0.5;
        const nz = (z - trackData.centerZ) / trackData.scale + 0.5;
        return {
          x: margin + nx * drawSize,
          y: margin + nz * drawSize
        };
      } else {
        return {
          x: margin + (x / defaultScale + 0.5) * drawSize,
          y: margin + (z / defaultScale + 0.5) * drawSize
        };
      }
    };
    
    // Draw terrain decorations (trees, rocks, flowers)
    // Trees (small green triangles)
    decorations.trees.forEach(tree => {
      const pos = toCanvas(tree.x, tree.z);
      if (pos.x >= 0 && pos.x <= size && pos.y >= 0 && pos.y <= size) {
        const treeSize = Math.max(1.5, tree.size * 0.8 / (trackData?.scale || defaultScale) * drawSize);
        ctx.fillStyle = isNightMode ? 'rgba(34, 80, 34, 0.6)' : 'rgba(46, 125, 50, 0.5)';
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y - treeSize);
        ctx.lineTo(pos.x - treeSize * 0.6, pos.y + treeSize * 0.5);
        ctx.lineTo(pos.x + treeSize * 0.6, pos.y + treeSize * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    });
    
    // Rocks (small gray circles)
    decorations.rocks.forEach(rock => {
      const pos = toCanvas(rock.x, rock.z);
      if (pos.x >= 0 && pos.x <= size && pos.y >= 0 && pos.y <= size) {
        const rockSize = Math.max(1, rock.size * 0.5 / (trackData?.scale || defaultScale) * drawSize);
        ctx.fillStyle = isNightMode ? 'rgba(75, 85, 99, 0.5)' : 'rgba(107, 114, 128, 0.4)';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, rockSize, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    
    // Flowers (colorful dots) - only in day mode
    if (!isNightMode) {
      decorations.flowers.forEach(flower => {
        const pos = toCanvas(flower.x, flower.z);
        if (pos.x >= 0 && pos.x <= size && pos.y >= 0 && pos.y <= size) {
          ctx.fillStyle = flower.color + '80'; // Add alpha
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }
    
    // Draw central plaza
    const plazaCenter = toCanvas(0, 0);
    ctx.fillStyle = isNightMode ? 'rgba(51, 51, 68, 0.4)' : 'rgba(121, 85, 72, 0.3)';
    ctx.beginPath();
    ctx.arc(plazaCenter.x, plazaCenter.y, Math.max(3, 12 / (trackData?.scale || defaultScale) * drawSize), 0, Math.PI * 2);
    ctx.fill();
    
    // Draw walkway ring
    ctx.strokeStyle = isNightMode ? 'rgba(100, 100, 120, 0.3)' : 'rgba(158, 158, 158, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(plazaCenter.x, plazaCenter.y, Math.max(5, 20 / (trackData?.scale || defaultScale) * drawSize), 0, Math.PI * 2);
    ctx.stroke();
    
    if (!trackData || trackPoints.length < 2) {
      // No track message - stylized
      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🎢', size / 2, size / 2 - 10);
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText('No track yet', size / 2, size / 2 + 10);
      
      // Draw legend
      drawLegend(ctx, size, isNightMode);
      return;
    }
    
    const { curve } = trackData;
    
    // Draw ground grid with subtle styling
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.1)';
    ctx.lineWidth = 0.5;
    const gridStep = 10;
    const gridMinX = Math.floor(trackData.minX / gridStep) * gridStep;
    const gridMinZ = Math.floor(trackData.minZ / gridStep) * gridStep;
    
    for (let x = gridMinX; x <= trackData.maxX + gridStep; x += gridStep) {
      const p1 = toCanvas(x, trackData.minZ);
      const p2 = toCanvas(x, trackData.maxZ);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (let z = gridMinZ; z <= trackData.maxZ + gridStep; z += gridStep) {
      const p1 = toCanvas(trackData.minX, z);
      const p2 = toCanvas(trackData.maxX, z);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    
    // Draw track curve with glow effect
    if (curve) {
      const samples = Math.max(50, trackPoints.length * 10);
      
      // Outer glow
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.3)';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      
      for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const point = curve.getPoint(t);
        const canvasPoint = toCanvas(point.x, point.z);
        
        if (i === 0) {
          ctx.moveTo(canvasPoint.x, canvasPoint.y);
        } else {
          ctx.lineTo(canvasPoint.x, canvasPoint.y);
        }
      }
      ctx.stroke();
      
      // Main track line with gradient based on height
      ctx.lineWidth = 3;
      for (let i = 0; i < samples; i++) {
        const t1 = i / samples;
        const t2 = (i + 1) / samples;
        const p1 = curve.getPoint(t1);
        const p2 = curve.getPoint(t2);
        
        const avgHeight = (p1.y + p2.y) / 2;
        const maxHeight = Math.max(...trackPoints.map(p => p.position.y));
        const minHeight = Math.min(...trackPoints.map(p => p.position.y));
        const heightRange = maxHeight - minHeight || 1;
        const normalizedHeight = (avgHeight - minHeight) / heightRange;
        
        // Beautiful gradient from cyan (low) through purple to magenta (high)
        const hue = 180 - normalizedHeight * 120; // 180 (cyan) to 60 (yellow)
        ctx.strokeStyle = `hsla(${hue}, 80%, 60%, 0.8)`;
        ctx.beginPath();
        const cp1 = toCanvas(p1.x, p1.z);
        const cp2 = toCanvas(p2.x, p2.z);
        ctx.moveTo(cp1.x, cp1.y);
        ctx.lineTo(cp2.x, cp2.y);
        ctx.stroke();
      }
    }
    
    // Draw track points with enhanced styling
    trackPoints.forEach((point, index) => {
      const canvasPoint = toCanvas(point.position.x, point.position.z);
      const isSelected = point.id === selectedPointId;
      const isFirst = index === 0;
      const isLast = index === trackPoints.length - 1;
      const hasLoop = point.hasLoop;
      
      // Glow for selected point
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(canvasPoint.x, canvasPoint.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(251, 191, 36, 0.3)';
        ctx.fill();
      }
      
      // Loop indicator (purple ring)
      if (hasLoop) {
        ctx.beginPath();
        ctx.arc(canvasPoint.x, canvasPoint.y, 7, 0, Math.PI * 2);
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Loop icon
        ctx.fillStyle = '#a855f7';
        ctx.font = 'bold 6px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('↻', canvasPoint.x, canvasPoint.y - 10);
      }
      
      // Point circle
      ctx.beginPath();
      ctx.arc(canvasPoint.x, canvasPoint.y, isSelected ? 5 : 3.5, 0, Math.PI * 2);
      
      if (isSelected) {
        ctx.fillStyle = '#fbbf24';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
      } else if (isFirst) {
        ctx.fillStyle = '#22c55e';
        ctx.shadowColor = '#22c55e';
        ctx.shadowBlur = 4;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (isLast) {
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 4;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fill();
      }
    });
    
    // Draw car position during ride with enhanced visuals
    if (mode === 'ride' && curve) {
      const carPoint = curve.getPoint(rideProgress);
      const canvasPoint = toCanvas(carPoint.x, carPoint.z);
      
      // Car glow
      ctx.beginPath();
      ctx.arc(canvasPoint.x, canvasPoint.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(249, 115, 22, 0.3)';
      ctx.fill();
      
      // Car outer ring
      ctx.beginPath();
      ctx.arc(canvasPoint.x, canvasPoint.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(249, 115, 22, 0.5)';
      ctx.fill();
      
      // Car indicator
      ctx.beginPath();
      ctx.arc(canvasPoint.x, canvasPoint.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f97316';
      ctx.shadowColor = '#f97316';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Direction indicator with arrow
      const tangent = curve.getTangent(rideProgress);
      const dirLength = 14;
      const endX = canvasPoint.x + tangent.x * dirLength;
      const endY = canvasPoint.y + tangent.z * dirLength;
      
      ctx.beginPath();
      ctx.moveTo(canvasPoint.x, canvasPoint.y);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Arrowhead
      const angle = Math.atan2(tangent.z, tangent.x);
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - 5 * Math.cos(angle - 0.5), endY - 5 * Math.sin(angle - 0.5));
      ctx.lineTo(endX - 5 * Math.cos(angle + 0.5), endY - 5 * Math.sin(angle + 0.5));
      ctx.closePath();
      ctx.fillStyle = '#fbbf24';
      ctx.fill();
    }
    
    // Draw stylized compass
    const compassX = size - 18;
    const compassY = size - 18;
    
    // Compass background
    ctx.beginPath();
    ctx.arc(compassX, compassY, 12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = 'bold 8px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', compassX, compassY - 5);
    
    // Compass dot
    ctx.beginPath();
    ctx.arc(compassX, compassY + 3, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(99, 102, 241, 0.6)';
    ctx.fill();
    
    // Draw legend
    drawLegend(ctx, size, isNightMode);
    
  }, [trackPoints, trackData, selectedPointId, rideProgress, mode, size, isNightMode, decorations, loopSegments]);
  
  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: 12
      }}
    />
  );
}

// Helper function to draw legend
function drawLegend(ctx: CanvasRenderingContext2D, size: number, isNight: boolean) {
  const legendY = size - 32;
  const legendX = 8;
  
  ctx.font = '7px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  
  // Start point
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(legendX + 4, legendY, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('Start', legendX + 10, legendY);
  
  // End point
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(legendX + 40, legendY, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('End', legendX + 46, legendY);
  
  // Loop indicator
  ctx.fillStyle = '#a855f7';
  ctx.beginPath();
  ctx.arc(legendX + 4, legendY + 10, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('Loop', legendX + 10, legendY + 10);
}
