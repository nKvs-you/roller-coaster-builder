/**
 * Canvas2DEditor - Full 2D Track Editor (No WebGL Required)
 * 
 * A complete roller coaster editor using HTML5 Canvas 2D
 * Works without WebGL, providing full editing capabilities
 */

import { useRef, useEffect, useState, useCallback } from "react";
import { useRollerCoaster } from "@/lib/stores/useRollerCoaster";
import * as THREE from "three";

interface Canvas2DEditorProps {
  width?: number;
  height?: number;
}

// Convert 3D world coordinates to 2D screen (isometric-like projection)
function worldToScreen(
  pos: THREE.Vector3,
  camera: { x: number; y: number; zoom: number; angle: number },
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  // Rotate around Y axis based on camera angle
  const cos = Math.cos(camera.angle);
  const sin = Math.sin(camera.angle);
  const rotatedX = pos.x * cos - pos.z * sin;
  const rotatedZ = pos.x * sin + pos.z * cos;
  
  // Isometric-like projection
  const screenX = (rotatedX - rotatedZ) * camera.zoom + canvasWidth / 2 - camera.x;
  const screenY = ((rotatedX + rotatedZ) * 0.5 - pos.y) * camera.zoom + canvasHeight / 2 - camera.y;
  
  return { x: screenX, y: screenY };
}

// Convert 2D screen to 3D world (assuming y=0 plane)
function screenToWorld(
  screenX: number,
  screenY: number,
  camera: { x: number; y: number; zoom: number; angle: number },
  canvasWidth: number,
  canvasHeight: number,
  groundY: number = 0
): THREE.Vector3 {
  // Reverse the projection
  const sx = (screenX - canvasWidth / 2 + camera.x) / camera.zoom;
  const sy = (screenY - canvasHeight / 2 + camera.y) / camera.zoom;
  
  const cos = Math.cos(camera.angle);
  const sin = Math.sin(camera.angle);
  
  const a = cos - sin;
  const b = -(sin + cos);
  const c = (cos + sin) * 0.5;
  const d = (cos - sin) * 0.5;
  
  const syAdj = sy + groundY;
  
  const det = a * d - b * c;
  if (Math.abs(det) < 0.0001) {
    return new THREE.Vector3(0, groundY, 0);
  }
  
  const x = (d * sx - b * syAdj) / det;
  const z = (-c * sx + a * syAdj) / det;
  
  return new THREE.Vector3(x, groundY, z);
}

export function Canvas2DEditor({ width, height }: Canvas2DEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 15, angle: Math.PI / 4 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [draggedPointId, setDraggedPointId] = useState<string | null>(null);
  
  const {
    trackPoints,
    loopSegments,
    selectedPointId,
    selectPoint,
    addTrackPoint,
    updateTrackPoint,
    isAddingPoints,
    isLooped,
    isNightMode,
    mode,
  } = useRollerCoaster();
  
  // Handle resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCanvasSize({ width: rect.width, height: rect.height });
      }
    };
    
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);
  
  // Draw the scene
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { width, height } = canvasSize;
    
    // Clear canvas
    if (isNightMode) {
      // Night gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#0f172a');
      gradient.addColorStop(0.5, '#1e293b');
      gradient.addColorStop(1, '#334155');
      ctx.fillStyle = gradient;
    } else {
      // Day gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#87ceeb');
      gradient.addColorStop(0.3, '#b0e0e6');
      gradient.addColorStop(1, '#90EE90');
      ctx.fillStyle = gradient;
    }
    ctx.fillRect(0, 0, width, height);
    
    // Draw stars at night
    if (isNightMode) {
      ctx.fillStyle = 'white';
      for (let i = 0; i < 100; i++) {
        const x = (Math.sin(i * 123.456) * 0.5 + 0.5) * width;
        const y = (Math.cos(i * 78.9) * 0.5 + 0.5) * height * 0.6;
        const size = (Math.sin(i * 45.6) * 0.5 + 0.5) * 2 + 0.5;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    // Draw grid
    ctx.strokeStyle = isNightMode ? 'rgba(100, 116, 139, 0.3)' : 'rgba(0, 100, 0, 0.2)';
    ctx.lineWidth = 1;
    
    const gridSize = 5;
    const gridRange = 50;
    
    for (let i = -gridRange; i <= gridRange; i += gridSize) {
      // Grid lines along X
      const start1 = worldToScreen(new THREE.Vector3(i, 0, -gridRange), camera, width, height);
      const end1 = worldToScreen(new THREE.Vector3(i, 0, gridRange), camera, width, height);
      ctx.beginPath();
      ctx.moveTo(start1.x, start1.y);
      ctx.lineTo(end1.x, end1.y);
      ctx.stroke();
      
      // Grid lines along Z
      const start2 = worldToScreen(new THREE.Vector3(-gridRange, 0, i), camera, width, height);
      const end2 = worldToScreen(new THREE.Vector3(gridRange, 0, i), camera, width, height);
      ctx.beginPath();
      ctx.moveTo(start2.x, start2.y);
      ctx.lineTo(end2.x, end2.y);
      ctx.stroke();
    }
    
    // Draw origin axes
    const origin = worldToScreen(new THREE.Vector3(0, 0, 0), camera, width, height);
    const xAxis = worldToScreen(new THREE.Vector3(10, 0, 0), camera, width, height);
    const zAxis = worldToScreen(new THREE.Vector3(0, 0, 10), camera, width, height);
    const yAxis = worldToScreen(new THREE.Vector3(0, 10, 0), camera, width, height);
    
    ctx.lineWidth = 2;
    // X axis (red)
    ctx.strokeStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(xAxis.x, xAxis.y);
    ctx.stroke();
    
    // Z axis (blue)
    ctx.strokeStyle = '#3b82f6';
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(zAxis.x, zAxis.y);
    ctx.stroke();
    
    // Y axis (green)
    ctx.strokeStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(yAxis.x, yAxis.y);
    ctx.stroke();
    
    // Draw track
    if (trackPoints.length >= 2) {
      // Draw track supports
      ctx.strokeStyle = isNightMode ? '#64748b' : '#8b4513';
      ctx.lineWidth = 2;
      
      for (const point of trackPoints) {
        const top = worldToScreen(point.position, camera, width, height);
        const bottom = worldToScreen(
          new THREE.Vector3(point.position.x, 0, point.position.z),
          camera, width, height
        );
        
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(bottom.x, bottom.y);
        ctx.stroke();
      }
      
      // Draw track line with gradient
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#ef4444');
      gradient.addColorStop(0.5, '#f97316');
      gradient.addColorStop(1, '#eab308');
      
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      ctx.beginPath();
      const firstScreen = worldToScreen(trackPoints[0].position, camera, width, height);
      ctx.moveTo(firstScreen.x, firstScreen.y);
      
      // Draw curved track using bezier curves
      for (let i = 1; i < trackPoints.length; i++) {
        const curr = worldToScreen(trackPoints[i].position, camera, width, height);
        const prev = worldToScreen(trackPoints[i - 1].position, camera, width, height);
        
        if (i === 1) {
          ctx.lineTo(curr.x, curr.y);
        } else {
          const prevPrev = worldToScreen(trackPoints[i - 2].position, camera, width, height);
          const cp1x = prev.x + (curr.x - prevPrev.x) * 0.2;
          const cp1y = prev.y + (curr.y - prevPrev.y) * 0.2;
          const cp2x = curr.x - (curr.x - prev.x) * 0.2;
          const cp2y = curr.y - (curr.y - prev.y) * 0.2;
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, curr.x, curr.y);
        }
      }
      
      // Close loop if needed
      if (isLooped && trackPoints.length >= 3) {
        const last = worldToScreen(trackPoints[trackPoints.length - 1].position, camera, width, height);
        const first = worldToScreen(trackPoints[0].position, camera, width, height);
        ctx.lineTo(first.x, first.y);
      }
      
      ctx.stroke();
      
      // Draw track rails
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 6;
      ctx.globalAlpha = 0.3;
      
      ctx.beginPath();
      ctx.moveTo(firstScreen.x, firstScreen.y);
      for (let i = 1; i < trackPoints.length; i++) {
        const curr = worldToScreen(trackPoints[i].position, camera, width, height);
        ctx.lineTo(curr.x, curr.y);
      }
      if (isLooped && trackPoints.length >= 3) {
        const first = worldToScreen(trackPoints[0].position, camera, width, height);
        ctx.lineTo(first.x, first.y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    
    // Draw loop indicators
    for (const segment of loopSegments) {
      const point = trackPoints.find(p => p.id === segment.entryPointId);
      if (point) {
        const screen = worldToScreen(point.position, camera, width, height);
        
        // Draw loop indicator
        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y - 30, 15, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw element type label
        ctx.fillStyle = '#ec4899';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(segment.elementType || 'loop', screen.x, screen.y - 50);
      }
    }
    
    // Draw track points
    for (let i = 0; i < trackPoints.length; i++) {
      const point = trackPoints[i];
      const screen = worldToScreen(point.position, camera, width, height);
      
      const isSelected = point.id === selectedPointId;
      const isHovered = point.id === hoveredPointId;
      
      // Point shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.arc(screen.x + 2, screen.y + 2, isSelected ? 12 : 8, 0, Math.PI * 2);
      ctx.fill();
      
      // Point fill
      if (isSelected) {
        ctx.fillStyle = '#22c55e';
      } else if (isHovered) {
        ctx.fillStyle = '#fbbf24';
      } else if (point.hasLoop) {
        ctx.fillStyle = '#ec4899';
      } else {
        ctx.fillStyle = '#6366f1';
      }
      
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, isSelected ? 10 : 7, 0, Math.PI * 2);
      ctx.fill();
      
      // Point border
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Point number
      ctx.fillStyle = 'white';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), screen.x, screen.y);
      
      // Height label
      ctx.fillStyle = isNightMode ? '#94a3b8' : '#475569';
      ctx.font = '9px Inter, sans-serif';
      ctx.fillText(`${point.position.y.toFixed(1)}m`, screen.x, screen.y + 18);
    }
    
    // Draw add point indicator when in add mode
    if (isAddingPoints && mode === 'build') {
      ctx.fillStyle = 'rgba(99, 102, 241, 0.5)';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Click to add point', width / 2, height - 30);
    }
    
  }, [trackPoints, loopSegments, selectedPointId, hoveredPointId, camera, canvasSize, isNightMode, isAddingPoints, isLooped, mode]);
  
  // Redraw on changes
  useEffect(() => {
    draw();
  }, [draw]);
  
  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if clicking on a point
    for (const point of trackPoints) {
      const screen = worldToScreen(point.position, camera, canvasSize.width, canvasSize.height);
      const dist = Math.sqrt((x - screen.x) ** 2 + (y - screen.y) ** 2);
      
      if (dist < 15) {
        selectPoint(point.id);
        setDraggedPointId(point.id);
        return;
      }
    }
    
    // If in add mode and clicked on empty space, add a point
    if (isAddingPoints && mode === 'build') {
      const worldPos = screenToWorld(x, y, camera, canvasSize.width, canvasSize.height, 2);
      addTrackPoint(worldPos);
      return;
    }
    
    // Start camera drag
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };
  
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Handle point dragging
    if (draggedPointId) {
      const point = trackPoints.find(p => p.id === draggedPointId);
      if (point) {
        // Keep current height when dragging
        const worldPos = screenToWorld(x, y, camera, canvasSize.width, canvasSize.height, point.position.y);
        updateTrackPoint(draggedPointId, worldPos);
      }
      return;
    }
    
    // Handle camera drag
    if (isDragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setCamera(prev => ({
        ...prev,
        x: prev.x - dx,
        y: prev.y - dy,
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }
    
    // Check hover
    let foundHover = false;
    for (const point of trackPoints) {
      const screen = worldToScreen(point.position, camera, canvasSize.width, canvasSize.height);
      const dist = Math.sqrt((x - screen.x) ** 2 + (y - screen.y) ** 2);
      
      if (dist < 15) {
        setHoveredPointId(point.id);
        foundHover = true;
        break;
      }
    }
    
    if (!foundHover) {
      setHoveredPointId(null);
    }
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
    setDraggedPointId(null);
  };
  
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setCamera(prev => ({
      ...prev,
      zoom: Math.max(5, Math.min(50, prev.zoom * delta)),
    }));
  };
  
  // Get selected point for height control
  const selectedPoint = trackPoints.find(p => p.id === selectedPointId);
  
  // Height adjustment function
  const adjustSelectedPointHeight = (delta: number) => {
    if (selectedPoint) {
      const newPos = selectedPoint.position.clone();
      newPos.y = Math.max(0, newPos.y + delta);
      updateTrackPoint(selectedPointId!, newPos);
    }
  };
  
  // Keyboard controls for rotation and height
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'q' || e.key === 'Q') {
        setCamera(prev => ({ ...prev, angle: prev.angle - 0.1 }));
      } else if (e.key === 'e' || e.key === 'E') {
        setCamera(prev => ({ ...prev, angle: prev.angle + 0.1 }));
      } else if (e.key === 'w' || e.key === 'W') {
        adjustSelectedPointHeight(1);
      } else if (e.key === 's' || e.key === 'S') {
        adjustSelectedPointHeight(-1);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPoint]);
  
  return (
    <div 
      ref={containerRef}
      className="w-full h-full relative"
      style={{ cursor: isDragging ? 'grabbing' : (hoveredPointId ? 'pointer' : 'grab') }}
    >
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className="block"
      />
      
      {/* Camera controls overlay */}
      <div className="absolute bottom-4 right-4 flex gap-2">
        <button
          onClick={() => setCamera(prev => ({ ...prev, angle: prev.angle - 0.2 }))}
          className="w-10 h-10 bg-slate-800/80 hover:bg-slate-700/80 text-white rounded-lg flex items-center justify-center transition-colors"
          title="Rotate Left (Q)"
        >
          ↺
        </button>
        <button
          onClick={() => setCamera(prev => ({ ...prev, angle: prev.angle + 0.2 }))}
          className="w-10 h-10 bg-slate-800/80 hover:bg-slate-700/80 text-white rounded-lg flex items-center justify-center transition-colors"
          title="Rotate Right (E)"
        >
          ↻
        </button>
        <button
          onClick={() => setCamera({ x: 0, y: 0, zoom: 15, angle: Math.PI / 4 })}
          className="w-10 h-10 bg-slate-800/80 hover:bg-slate-700/80 text-white rounded-lg flex items-center justify-center transition-colors"
          title="Reset View"
        >
          ⌂
        </button>
      </div>
      
      {/* Selected point height control */}
      {selectedPoint && (
        <div className="absolute bottom-4 left-4 bg-slate-900/90 text-white text-xs p-3 rounded-lg border border-indigo-500/30">
          <div className="font-bold text-emerald-400 mb-2">
            Point {trackPoints.findIndex(p => p.id === selectedPointId) + 1}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 w-8">X:</span>
              <span className="text-cyan-400 font-mono">{selectedPoint.position.x.toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 w-8">Z:</span>
              <span className="text-cyan-400 font-mono">{selectedPoint.position.z.toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 w-8">Y:</span>
              <span className="text-amber-400 font-mono font-bold">{selectedPoint.position.y.toFixed(1)}m</span>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <span className="text-slate-400">Height:</span>
              <button
                onClick={() => adjustSelectedPointHeight(-1)}
                className="w-8 h-8 bg-red-600/80 hover:bg-red-500/80 text-white rounded flex items-center justify-center font-bold"
              >
                -
              </button>
              <input
                type="range"
                min="0"
                max="50"
                step="0.5"
                value={selectedPoint.position.y}
                onChange={(e) => {
                  const newPos = selectedPoint.position.clone();
                  newPos.y = parseFloat(e.target.value);
                  updateTrackPoint(selectedPointId!, newPos);
                }}
                className="flex-1 h-2"
              />
              <button
                onClick={() => adjustSelectedPointHeight(1)}
                className="w-8 h-8 bg-emerald-600/80 hover:bg-emerald-500/80 text-white rounded flex items-center justify-center font-bold"
              >
                +
              </button>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Use W/S keys for quick adjust</div>
          </div>
        </div>
      )}
      
      {/* Instructions */}
      <div className="absolute top-4 left-4 bg-slate-900/80 text-white text-xs p-3 rounded-lg space-y-1">
        <div className="font-bold text-indigo-400 mb-2">2D Editor Controls</div>
        <div>🖱️ Drag empty space to pan</div>
        <div>🔘 Click point to select</div>
        <div>↔️ Drag point to move</div>
        <div>🖱️ Scroll to zoom</div>
        <div>⌨️ Q/E to rotate view</div>
        <div>⌨️ W/S to adjust height</div>
      </div>
    </div>
  );
}
