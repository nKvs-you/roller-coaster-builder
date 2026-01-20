/**
 * GForceDisplay Component
 * 
 * Real-time physics visualization during ride mode
 * Shows G-forces, speed, height, and other physics data
 */

import { useState, useEffect, useRef } from "react";
import { usePhysicsSimulation, PhysicsData } from "@/hooks/usePhysicsSimulation";
import { useRollerCoaster } from "@/lib/stores/useRollerCoaster";

interface GForceGaugeProps {
  value: number;
  min: number;
  max: number;
  label: string;
  unit: string;
  warningThreshold?: number;
  dangerThreshold?: number;
}

function GForceGauge({ value, min, max, label, unit, warningThreshold, dangerThreshold }: GForceGaugeProps) {
  const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  
  // Determine color based on thresholds
  let color = "from-emerald-400 to-cyan-400";
  let textColor = "text-emerald-400";
  
  if (dangerThreshold && Math.abs(value) >= dangerThreshold) {
    color = "from-red-500 to-rose-500";
    textColor = "text-red-400";
  } else if (warningThreshold && Math.abs(value) >= warningThreshold) {
    color = "from-amber-400 to-orange-500";
    textColor = "text-amber-400";
  }
  
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center text-[10px]">
        <span className="text-slate-400 font-medium">{label}</span>
        <span className={`font-bold ${textColor}`}>
          {value.toFixed(2)} {unit}
        </span>
      </div>
      <div className="h-2 bg-slate-800/50 rounded-full overflow-hidden">
        <div 
          className={`h-full bg-gradient-to-r ${color} transition-all duration-150 rounded-full`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function CircularGauge({ 
  value, 
  max, 
  label, 
  unit,
  size = 80,
}: { 
  value: number; 
  max: number; 
  label: string; 
  unit: string;
  size?: number;
}) {
  const percentage = Math.max(0, Math.min(100, (value / max) * 100));
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  
  // Color based on percentage
  let color = "#10b981"; // emerald
  if (percentage > 80) color = "#f59e0b"; // amber
  if (percentage > 95) color = "#ef4444"; // red
  
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Background circle */}
        <svg className="absolute" width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(100, 116, 139, 0.2)"
            strokeWidth={strokeWidth}
          />
        </svg>
        
        {/* Progress circle */}
        <svg 
          className="absolute transform -rotate-90" 
          width={size} 
          height={size}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-150"
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
          />
        </svg>
        
        {/* Center value */}
        <div 
          className="absolute inset-0 flex flex-col items-center justify-center"
        >
          <span className="text-white font-bold text-lg leading-none">
            {value.toFixed(0)}
          </span>
          <span className="text-slate-400 text-[9px]">{unit}</span>
        </div>
      </div>
      <span className="text-slate-400 text-[10px] mt-1">{label}</span>
    </div>
  );
}

function GForceMeter({ vertical, lateral }: { vertical: number; lateral: number }) {
  const size = 100;
  const center = size / 2;
  const maxG = 5;
  
  // Calculate position (clamped to circle)
  const x = Math.max(-maxG, Math.min(maxG, lateral)) / maxG * (center - 10);
  const y = Math.max(-maxG, Math.min(maxG, vertical - 1)) / maxG * (center - 10) * -1; // Invert Y, subtract 1G baseline
  
  // Determine color based on total G
  const totalG = Math.sqrt(vertical * vertical + lateral * lateral);
  let dotColor = "#10b981";
  if (totalG > 3) dotColor = "#f59e0b";
  if (totalG > 4) dotColor = "#ef4444";
  
  return (
    <div className="flex flex-col items-center">
      <div 
        className="relative rounded-full border border-slate-600/50 bg-slate-900/50"
        style={{ width: size, height: size }}
      >
        {/* Grid lines */}
        <svg className="absolute inset-0" width={size} height={size}>
          {/* Horizontal line */}
          <line 
            x1={10} y1={center} x2={size - 10} y2={center} 
            stroke="rgba(148, 163, 184, 0.2)" 
            strokeWidth={1}
          />
          {/* Vertical line */}
          <line 
            x1={center} y1={10} x2={center} y2={size - 10} 
            stroke="rgba(148, 163, 184, 0.2)" 
            strokeWidth={1}
          />
          {/* Center circle */}
          <circle 
            cx={center} cy={center} r={center - 10}
            fill="none" 
            stroke="rgba(148, 163, 184, 0.1)"
            strokeWidth={1}
          />
          {/* 1G marker */}
          <circle 
            cx={center} cy={center} r={(center - 10) / 5}
            fill="none" 
            stroke="rgba(148, 163, 184, 0.15)"
            strokeWidth={1}
          />
        </svg>
        
        {/* G-force indicator dot */}
        <div 
          className="absolute w-4 h-4 rounded-full transition-all duration-100"
          style={{ 
            left: center + x - 8,
            top: center + y - 8,
            backgroundColor: dotColor,
            boxShadow: `0 0 10px ${dotColor}, 0 0 20px ${dotColor}50`,
          }}
        />
        
        {/* Labels */}
        <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] text-slate-500">+G</span>
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] text-slate-500">-G</span>
        <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[8px] text-slate-500">L</span>
        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] text-slate-500">R</span>
      </div>
      
      <div className="flex gap-4 mt-2 text-[10px]">
        <span className="text-slate-400">
          Vert: <span className="text-cyan-400 font-bold">{vertical.toFixed(2)}G</span>
        </span>
        <span className="text-slate-400">
          Lat: <span className="text-purple-400 font-bold">{lateral.toFixed(2)}G</span>
        </span>
      </div>
    </div>
  );
}

export function GForceDisplay() {
  const { isRiding, rideProgress } = useRollerCoaster();
  const { physicsData, isSimulating } = usePhysicsSimulation();
  
  const [isExpanded, setIsExpanded] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  if (!isRiding) return null;
  
  return (
    <div className="absolute top-4 right-4 pointer-events-auto animate-fade-in z-50">
      <div className="glass-panel rounded-xl p-3 min-w-[200px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isSimulating ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            <span className="text-white text-xs font-bold">LIVE TELEMETRY</span>
          </div>
          <div className="flex gap-1">
            {physicsData.isAirtime && (
              <span className="text-[8px] text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded">
                AIRTIME
              </span>
            )}
            <button 
              className="text-slate-400 hover:text-white transition-colors"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points={isExpanded ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
              </svg>
            </button>
          </div>
        </div>
        
        {isExpanded && (
          <>
            {/* Speed display */}
            <div className="flex justify-center gap-4 mb-4">
              <CircularGauge 
                value={physicsData.speedKmh} 
                max={150} 
                label="Speed" 
                unit="km/h" 
              />
              <CircularGauge 
                value={physicsData.height} 
                max={50} 
                label="Height" 
                unit="m" 
              />
            </div>
            
            {/* G-Force meter */}
            <div className="flex justify-center mb-4">
              <GForceMeter 
                vertical={physicsData.gForceVertical} 
                lateral={physicsData.gForceLateral} 
              />
            </div>
            
            {/* Status indicators */}
            <div className="flex justify-center gap-2 mb-3">
              {physicsData.isOnChainLift && (
                <div className="flex items-center gap-1 text-[10px] bg-amber-500/20 text-amber-400 px-2 py-1 rounded">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L15 8L22 9L17 14L18 21L12 18L6 21L7 14L2 9L9 8Z" />
                  </svg>
                  CHAIN LIFT
                </div>
              )}
              {physicsData.isInLoop && (
                <div className="flex items-center gap-1 text-[10px] bg-purple-500/20 text-purple-400 px-2 py-1 rounded">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 2A10 10 0 0 1 22 12" />
                  </svg>
                  LOOP
                </div>
              )}
            </div>
            
            {/* Advanced toggle */}
            <button
              className="w-full text-[10px] text-slate-400 hover:text-white transition-colors py-1"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? '▲ Hide Details' : '▼ Show Details'}
            </button>
            
            {showAdvanced && (
              <div className="mt-2 pt-2 border-t border-white/10 space-y-2">
                <GForceGauge 
                  value={physicsData.gForceTotal}
                  min={0}
                  max={6}
                  label="Total G-Force"
                  unit="G"
                  warningThreshold={3.5}
                  dangerThreshold={5}
                />
                <GForceGauge 
                  value={physicsData.gForceLongitudinal}
                  min={-3}
                  max={3}
                  label="Longitudinal G"
                  unit="G"
                  warningThreshold={1.5}
                  dangerThreshold={2}
                />
                <GForceGauge 
                  value={physicsData.acceleration}
                  min={-20}
                  max={20}
                  label="Acceleration"
                  unit="m/s²"
                />
                
                <div className="grid grid-cols-2 gap-2 text-[10px] pt-2">
                  <div className="bg-slate-800/30 rounded p-2">
                    <span className="text-slate-500 block">Progress</span>
                    <span className="text-white font-bold">
                      {(rideProgress * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="bg-slate-800/30 rounded p-2">
                    <span className="text-slate-500 block">Speed (mph)</span>
                    <span className="text-white font-bold">
                      {physicsData.speedMph.toFixed(1)}
                    </span>
                  </div>
                  <div className="bg-slate-800/30 rounded p-2">
                    <span className="text-slate-500 block">Track Grade</span>
                    <span className="text-white font-bold">
                      {physicsData.grade.toFixed(1)}%
                    </span>
                  </div>
                  <div className="bg-slate-800/30 rounded p-2">
                    <span className="text-slate-500 block">Bank Angle</span>
                    <span className="text-white font-bold">
                      {(physicsData.bankAngle * 180 / Math.PI).toFixed(1)}°
                    </span>
                  </div>
                </div>
                
                {/* Energy display */}
                <div className="pt-2 border-t border-white/5">
                  <div className="text-[9px] text-slate-500 mb-1">Energy Conservation</div>
                  <div className="h-3 bg-slate-800/50 rounded-full overflow-hidden flex">
                    <div 
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-150"
                      style={{ width: `${(physicsData.kineticEnergy / (physicsData.totalEnergy || 1)) * 100}%` }}
                    />
                    <div 
                      className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-150"
                      style={{ width: `${(physicsData.potentialEnergy / (physicsData.totalEnergy || 1)) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[8px] mt-1">
                    <span className="text-cyan-400">KE: {(physicsData.kineticEnergy / 1000).toFixed(1)} kJ</span>
                    <span className="text-amber-400">PE: {(physicsData.potentialEnergy / 1000).toFixed(1)} kJ</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
