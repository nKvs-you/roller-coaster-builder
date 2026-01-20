import { useState, useRef, useMemo } from "react";
import { useRollerCoaster } from "@/lib/stores/useRollerCoaster";
import { useKeyboardShortcuts, KEYBOARD_SHORTCUTS } from "@/hooks/useKeyboardShortcuts";
import { computeTrackStats, formatTime, formatDistance } from "@/lib/trackUtils";
import { Button } from "@/components/ui/button";
import { MiniMap } from "./MiniMap";

// Icons as simple SVG components
const IconUndo = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
  </svg>
);

const IconRedo = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
  </svg>
);

const IconHelp = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const IconWarning = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const IconChevron = ({ expanded }: { expanded: boolean }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="12" 
    height="12" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2"
    style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// Tooltip component
function Tooltip({ children, text }: { children: React.ReactNode; text: string }) {
  const [show, setShow] = useState(false);
  
  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-[10px] bg-slate-900/95 text-white rounded-lg whitespace-nowrap pointer-events-none border border-indigo-500/30 shadow-lg shadow-indigo-500/10 backdrop-blur-sm">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900/95" />
        </div>
      )}
    </div>
  );
}

// Collapsible section component
function Section({ 
  title, 
  children, 
  defaultExpanded = true,
  badge,
  icon,
}: { 
  title: string; 
  children: React.ReactNode; 
  defaultExpanded?: boolean;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button 
        className="w-full flex items-center justify-between py-2.5 px-3 hover:bg-white/5 transition-all duration-200 text-left group"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[11px] font-semibold text-slate-200 flex items-center gap-2">
          {icon && <span className="text-indigo-400">{icon}</span>}
          {title}
          {badge}
        </span>
        <div className={`text-slate-400 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}>
          <IconChevron expanded={false} />
        </div>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${expanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="pb-3 px-3">{children}</div>
      </div>
    </div>
  );
}

export function GameUI() {
  // Enable keyboard shortcuts
  useKeyboardShortcuts();
  const {
    mode,
    trackPoints,
    loopSegments,
    startRide,
    stopRide,
    clearTrack,
    rideProgress,
    selectedPointId,
    removeTrackPoint,
    rideSpeed,
    setRideSpeed,
    isAddingPoints,
    setIsAddingPoints,
    isLooped,
    setIsLooped,
    hasChainLift,
    setHasChainLift,
    showWoodSupports,
    setShowWoodSupports,
    isNightMode,
    setIsNightMode,
    createLoopAtPoint,
    removeLoopAtPoint,
    duplicateTrackPoint,
    setCameraTarget,
    savedCoasters,
    currentCoasterName,
    saveCoaster,
    loadCoaster,
    deleteCoaster,
    exportCoaster,
    importCoaster,
    undo,
    redo,
    canUndo,
    canRedo,
    snapToGrid,
    setSnapToGrid,
    gridSize,
    setGridSize,
  } = useRollerCoaster();
  
  const [position, setPosition] = useState({ x: 8, y: 8 });
  const [isDragging, setIsDragging] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  
  // Compute track statistics
  const trackStats = useMemo(() => {
    return computeTrackStats(trackPoints, loopSegments, isLooped);
  }, [trackPoints, loopSegments, isLooped]);
  
  // Get selected point info
  const selectedPoint = useMemo(() => {
    if (!selectedPointId) return null;
    const index = trackPoints.findIndex(p => p.id === selectedPointId);
    if (index === -1) return null;
    return { ...trackPoints[index], index };
  }, [selectedPointId, trackPoints]);
  
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragOffset.current.x,
      y: e.clientY - dragOffset.current.y,
    });
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  const handleSave = () => {
    if (saveName.trim()) {
      saveCoaster(saveName.trim());
      setSaveName("");
      setShowSaveDialog(false);
    }
  };
  
  const handleExport = (id: string) => {
    const json = exportCoaster(id);
    if (json) {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const coaster = savedCoasters.find(c => c.id === id);
      a.download = `${coaster?.name || "coaster"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };
  
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (importCoaster(text)) {
          alert("Coaster imported successfully!");
        } else {
          alert("Failed to import coaster. Invalid file format.");
        }
      };
      reader.readAsText(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  
  const canRide = trackPoints.length >= 2;
  
  return (
    <div 
      className="absolute top-0 left-0 w-full h-full pointer-events-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Main Control Panel */}
      <div 
        className="absolute pointer-events-auto glass-panel rounded-2xl text-white text-xs select-none animate-fade-in custom-scrollbar"
        style={{ 
          left: position.x, 
          top: position.y, 
          width: '240px',
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.9) 100%)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(99, 102, 241, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-white/10 cursor-move bg-gradient-to-r from-indigo-600/20 to-purple-600/20">
          <h1 className="text-sm font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent flex items-center gap-2">
            <span className="text-lg">🎢</span>
            Coaster Builder
          </h1>
          <div className="flex gap-1">
            <Tooltip text="Undo (Ctrl+Z)">
              <button 
                onClick={() => canUndo() && undo()}
                disabled={!canUndo()}
                className={`p-1.5 rounded-lg transition-all duration-200 ${canUndo() ? 'hover:bg-white/10 hover:text-indigo-400' : 'opacity-30'}`}
              >
                <IconUndo />
              </button>
            </Tooltip>
            <Tooltip text="Redo (Ctrl+Shift+Z)">
              <button 
                onClick={() => canRedo() && redo()}
                disabled={!canRedo()}
                className={`p-1.5 rounded-lg transition-all duration-200 ${canRedo() ? 'hover:bg-white/10 hover:text-indigo-400' : 'opacity-30'}`}
              >
                <IconRedo />
              </button>
            </Tooltip>
            <Tooltip text="Help & Shortcuts">
              <button 
                onClick={() => setShowHelpDialog(true)}
                className="p-1.5 rounded-lg hover:bg-white/10 hover:text-indigo-400 transition-all duration-200"
              >
                <IconHelp />
              </button>
            </Tooltip>
          </div>
        </div>
        
        {mode === "build" && (
          <>
            {/* Track Stats Section */}
            <Section 
              title="Track Stats" 
              defaultExpanded={true}
              icon="📊"
              badge={trackStats.hasProblems ? (
                <span className="ml-2 px-2 py-0.5 text-[9px] rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  {trackStats.problems.length} issue{trackStats.problems.length > 1 ? 's' : ''}
                </span>
              ) : null}
            >
              <div className="grid grid-cols-2 gap-2">
                <div className="stat-card">
                  <div className="text-[9px] text-slate-400 uppercase tracking-wider">Points</div>
                  <div className="text-sm font-bold text-white">{trackStats.numPoints}</div>
                </div>
                <div className="stat-card">
                  <div className="text-[9px] text-slate-400 uppercase tracking-wider">Length</div>
                  <div className="text-sm font-bold text-white">{formatDistance(trackStats.totalLength)}</div>
                </div>
                <div className="stat-card">
                  <div className="text-[9px] text-slate-400 uppercase tracking-wider">Max Height</div>
                  <div className="text-sm font-bold text-cyan-400">{trackStats.maxHeight.toFixed(1)}m</div>
                </div>
                <div className="stat-card">
                  <div className="text-[9px] text-slate-400 uppercase tracking-wider">Max Grade</div>
                  <div className={`text-sm font-bold ${trackStats.maxGrade > 60 ? 'text-amber-400' : 'text-emerald-400'}`}>{trackStats.maxGrade.toFixed(0)}°</div>
                </div>
                <div className="stat-card">
                  <div className="text-[9px] text-slate-400 uppercase tracking-wider">Loops</div>
                  <div className="text-sm font-bold text-pink-400">{trackStats.numLoops}</div>
                </div>
                <div className="stat-card">
                  <div className="text-[9px] text-slate-400 uppercase tracking-wider">Est. Time</div>
                  <div className="text-sm font-bold text-purple-400">{formatTime(trackStats.estimatedRideTime)}</div>
                </div>
              </div>
              {trackStats.problems.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {trackStats.problems.slice(0, 3).map((problem, i) => (
                    <div key={i} className={`text-[10px] px-2 py-1.5 rounded-lg flex items-center gap-2 ${problem.severity === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                      <IconWarning />
                      {problem.message}
                    </div>
                  ))}
                </div>
              )}
            </Section>
            
            {/* Tools Section */}
            <Section title="Tools" defaultExpanded={true} icon="🔧">
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Tooltip text="Click ground to add points (A)">
                    <Button
                      size="sm"
                      onClick={() => setIsAddingPoints(!isAddingPoints)}
                      className={`h-8 text-[10px] px-3 flex-1 font-medium transition-all duration-200 ${isAddingPoints 
                        ? "bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 shadow-lg shadow-indigo-500/25" 
                        : "bg-slate-700/50 hover:bg-slate-600/50 border border-white/10"}`}
                    >
                      {isAddingPoints ? "✓ Add Mode" : "Add Mode"}
                    </Button>
                  </Tooltip>
                  <Tooltip text="Connect last point to first">
                    <Button
                      size="sm"
                      onClick={() => setIsLooped(!isLooped)}
                      disabled={trackPoints.length < 3}
                      className={`h-8 text-[10px] px-3 flex-1 font-medium transition-all duration-200 ${isLooped 
                        ? "bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 shadow-lg shadow-purple-500/25" 
                        : "bg-slate-700/50 hover:bg-slate-600/50 border border-white/10"}`}
                    >
                      {isLooped ? "✓ Loop" : "Loop"}
                    </Button>
                  </Tooltip>
                </div>
                
                <div className="flex gap-2">
                  <Tooltip text="Chain lift for initial climb">
                    <Button
                      size="sm"
                      onClick={() => setHasChainLift(!hasChainLift)}
                      className={`h-8 text-[10px] px-3 flex-1 font-medium transition-all duration-200 ${hasChainLift 
                        ? "bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 shadow-lg shadow-amber-500/25" 
                        : "bg-slate-700/50 hover:bg-slate-600/50 border border-white/10"}`}
                    >
                      {hasChainLift ? "✓ Chain" : "Chain"}
                    </Button>
                  </Tooltip>
                  <Tooltip text="Show wooden support structure">
                    <Button
                      size="sm"
                      onClick={() => setShowWoodSupports(!showWoodSupports)}
                      disabled={trackPoints.length < 2}
                      className={`h-8 text-[10px] px-3 flex-1 font-medium transition-all duration-200 ${showWoodSupports 
                        ? "bg-gradient-to-r from-orange-700 to-orange-600 hover:from-orange-600 hover:to-orange-500 shadow-lg shadow-orange-500/25" 
                        : "bg-slate-700/50 hover:bg-slate-600/50 border border-white/10"}`}
                    >
                      {showWoodSupports ? "✓ Wood" : "Wood"}
                    </Button>
                  </Tooltip>
                </div>
                
                <Tooltip text="Toggle day/night mode">
                  <Button
                    size="sm"
                    onClick={() => setIsNightMode(!isNightMode)}
                    className={`h-8 text-[10px] px-3 w-full font-medium transition-all duration-200 ${isNightMode 
                      ? "bg-gradient-to-r from-indigo-800 to-violet-700 hover:from-indigo-700 hover:to-violet-600 shadow-lg shadow-violet-500/25" 
                      : "bg-gradient-to-r from-sky-500 to-blue-500 hover:from-sky-400 hover:to-blue-400 shadow-lg shadow-sky-500/25"}`}
                  >
                    {isNightMode ? "🌙 Night Mode" : "☀️ Day Mode"}
                  </Button>
                </Tooltip>
                
                <div className="flex gap-2 items-center">
                  <Tooltip text="Snap points to grid (G)">
                    <Button
                      size="sm"
                      onClick={() => setSnapToGrid(!snapToGrid)}
                      className={`h-8 text-[10px] px-3 flex-1 font-medium transition-all duration-200 ${snapToGrid 
                        ? "bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 shadow-lg shadow-teal-500/25" 
                        : "bg-slate-700/50 hover:bg-slate-600/50 border border-white/10"}`}
                    >
                      {snapToGrid ? "✓ Grid Snap" : "Grid Snap"}
                    </Button>
                  </Tooltip>
                  {snapToGrid && (
                    <select
                      value={gridSize}
                      onChange={(e) => setGridSize(parseFloat(e.target.value))}
                      className="h-8 text-[10px] px-2 bg-slate-700/50 border border-white/10 rounded text-white"
                    >
                      <option value="0.5">0.5m</option>
                      <option value="1">1m</option>
                      <option value="2">2m</option>
                      <option value="5">5m</option>
                    </select>
                  )}
                </div>
              </div>
            </Section>
            
            {/* Selected Point Section */}
            {selectedPoint && (
              <Section title={`Point ${selectedPoint.index + 1}`} defaultExpanded={true} icon="📍">
                <div className="flex flex-col gap-2">
                  <div className="text-[10px] text-slate-400 bg-slate-800/50 rounded-lg px-3 py-2 font-mono">
                    X: {selectedPoint.position.x.toFixed(1)} | Y: {selectedPoint.position.y.toFixed(1)} | Z: {selectedPoint.position.z.toFixed(1)}
                  </div>
                  
                  <div className="flex gap-2">
                    <Tooltip text="Focus camera on point">
                      <Button
                        size="sm"
                        onClick={() => setCameraTarget(selectedPoint.position.clone())}
                        className="h-8 text-[10px] px-3 flex-1 font-medium bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 shadow-lg shadow-cyan-500/25 transition-all duration-200"
                      >
                        🎯 Focus
                      </Button>
                    </Tooltip>
                    <Tooltip text="Duplicate point (D)">
                      <Button
                        size="sm"
                        onClick={() => duplicateTrackPoint(selectedPointId!)}
                        className="h-8 text-[10px] px-3 flex-1 font-medium bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 shadow-lg shadow-emerald-500/25 transition-all duration-200"
                      >
                        📋 Dupe
                      </Button>
                    </Tooltip>
                  </div>
                  
                  <div className="flex gap-2">
                    {selectedPoint.hasLoop ? (
                      <Tooltip text="Remove loop at this point">
                        <Button
                          size="sm"
                          onClick={() => removeLoopAtPoint(selectedPointId!)}
                          className="h-8 text-[10px] px-3 flex-1 font-medium bg-gradient-to-r from-pink-800 to-rose-700 hover:from-pink-700 hover:to-rose-600 shadow-lg shadow-rose-500/25 transition-all duration-200"
                        >
                          🔄 Remove Loop
                        </Button>
                      </Tooltip>
                    ) : (
                      <Tooltip text="Add vertical loop at this point">
                        <Button
                          size="sm"
                          onClick={() => createLoopAtPoint(selectedPointId!)}
                          className="h-8 text-[10px] px-3 flex-1 font-medium bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 shadow-lg shadow-pink-500/25 transition-all duration-200"
                        >
                          🔄 Add Loop
                        </Button>
                      </Tooltip>
                    )}
                    <Tooltip text="Delete point (Del)">
                      <Button
                        size="sm"
                        onClick={() => removeTrackPoint(selectedPointId!)}
                        className="h-8 text-[10px] px-3 flex-1 font-medium bg-red-500/20 hover:bg-red-500/40 border border-red-500/50 text-red-400 transition-all duration-200"
                      >
                        🗑️ Delete
                      </Button>
                    </Tooltip>
                  </div>
                </div>
              </Section>
            )}
            
            {/* Actions Section */}
            <Section title="Actions" defaultExpanded={true} icon="🚀">
              <div className="flex flex-col gap-2">
                <Tooltip text="Start ride (Space)">
                  <Button
                    size="sm"
                    onClick={startRide}
                    disabled={!canRide}
                    className="h-10 text-[12px] px-4 w-full font-bold bg-gradient-to-r from-emerald-600 via-green-500 to-teal-500 hover:from-emerald-500 hover:via-green-400 hover:to-teal-400 shadow-lg shadow-green-500/30 transition-all duration-200 disabled:opacity-50 disabled:shadow-none"
                  >
                    🎢 Start Ride
                  </Button>
                </Tooltip>
                
                <div className="flex gap-2">
                  <Tooltip text="Save to browser storage">
                    <Button
                      size="sm"
                      onClick={() => setShowSaveDialog(true)}
                      disabled={trackPoints.length < 2}
                      className="h-8 text-[10px] px-3 flex-1 font-medium bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 shadow-lg shadow-teal-500/25 transition-all duration-200"
                    >
                      💾 Save
                    </Button>
                  </Tooltip>
                  <Tooltip text="Load saved coaster">
                    <Button
                      size="sm"
                      onClick={() => setShowLoadDialog(true)}
                      className="h-8 text-[10px] px-3 flex-1 font-medium bg-slate-700/50 hover:bg-slate-600/50 border border-white/10 transition-all duration-200"
                    >
                      📂 Load
                    </Button>
                  </Tooltip>
                </div>
                
                <Tooltip text="Clear all points">
                  <Button
                    size="sm"
                    onClick={clearTrack}
                    disabled={trackPoints.length === 0}
                    className="h-8 text-[10px] px-3 w-full font-medium bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 transition-all duration-200"
                  >
                    🗑️ Clear Track
                  </Button>
                </Tooltip>
              </div>
            </Section>
            
            {/* Speed Control */}
            <Section title="Ride Speed" defaultExpanded={false} icon="⚡">
              <div className="px-1">
                <div className="flex justify-between text-[10px] text-slate-400 mb-2">
                  <span>🐢 Slow</span>
                  <span className="font-bold text-indigo-400 text-sm">{rideSpeed.toFixed(1)}x</span>
                  <span>Fast 🐇</span>
                </div>
                <input
                  type="range"
                  min="0.25"
                  max="3"
                  step="0.25"
                  value={rideSpeed}
                  onChange={(e) => setRideSpeed(parseFloat(e.target.value))}
                  className="w-full h-2"
                />
              </div>
            </Section>
          </>
        )}
        
        {mode === "ride" && (
          <div className="p-4">
            <div className="mb-4">
              <div className="flex justify-between text-[10px] text-slate-400 mb-2">
                <span>Progress</span>
                <span className="font-bold text-emerald-400">{Math.round(rideProgress * 100)}%</span>
              </div>
              <div className="h-3 bg-slate-800 rounded-full overflow-hidden shadow-inner">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-green-400 to-teal-400 transition-all duration-100 relative"
                  style={{ width: `${rideProgress * 100}%` }}
                >
                  <div className="absolute inset-0 shimmer" />
                </div>
              </div>
            </div>
            
            <div className="flex gap-2 mb-3">
              <Button
                size="sm"
                onClick={() => setRideSpeed(Math.max(0.25, rideSpeed - 0.25))}
                className="h-8 text-[10px] px-3 flex-1 font-medium bg-slate-700/50 hover:bg-slate-600/50 border border-white/10 transition-all duration-200"
              >
                🐢 Slower
              </Button>
              <div className="flex items-center justify-center px-2 text-sm font-bold text-indigo-400">
                {rideSpeed.toFixed(1)}x
              </div>
              <Button
                size="sm"
                onClick={() => setRideSpeed(Math.min(3, rideSpeed + 0.25))}
                className="h-8 text-[10px] px-3 flex-1 font-medium bg-slate-700/50 hover:bg-slate-600/50 border border-white/10 transition-all duration-200"
              >
                Faster 🐇
              </Button>
            </div>
            
            <Button
              size="sm"
              onClick={stopRide}
              className="h-10 text-[11px] px-4 w-full font-bold bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 shadow-lg shadow-red-500/30 transition-all duration-200"
            >
              ⏹️ Exit Ride (Esc)
            </Button>
          </div>
        )}
        
        {/* Footer with current coaster name */}
        {currentCoasterName && (
          <div className="p-3 border-t border-white/5 bg-gradient-to-r from-indigo-600/10 to-purple-600/10">
            <p className="text-[10px] text-slate-400 truncate flex items-center gap-2">
              <span className="text-indigo-400">📁</span>
              <span className="font-medium text-white">{currentCoasterName}</span>
            </p>
          </div>
        )}
      </div>
      
      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-auto animate-fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSaveDialog(false)} />
          <div className="relative glass-panel p-5 rounded-2xl text-white max-w-sm w-full mx-4 shadow-2xl border border-indigo-500/20">
            <h2 className="text-base font-bold mb-4 bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">💾 Save Coaster</h2>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Enter coaster name..."
              className="styled-input w-full text-sm mb-4"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
            <div className="flex gap-3">
              <Button size="sm" onClick={handleSave} className="flex-1 h-9 font-medium bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 shadow-lg shadow-teal-500/25 transition-all duration-200">
                Save
              </Button>
              <Button size="sm" onClick={() => setShowSaveDialog(false)} className="flex-1 h-9 font-medium bg-slate-700/50 hover:bg-slate-600/50 border border-white/10 transition-all duration-200">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Load Dialog */}
      {showLoadDialog && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-auto animate-fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowLoadDialog(false)} />
          <div className="relative glass-panel p-5 rounded-2xl text-white max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto shadow-2xl border border-indigo-500/20 custom-scrollbar">
            <h2 className="text-base font-bold mb-4 bg-gradient-to-r from-slate-200 to-indigo-300 bg-clip-text text-transparent">📂 Load Coaster</h2>
            
            {savedCoasters.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">🎢</div>
                <p className="text-slate-400 text-sm">No saved coasters yet.</p>
                <p className="text-slate-500 text-xs mt-1">Create your first masterpiece!</p>
              </div>
            ) : (
              <div className="space-y-3 mb-4">
                {savedCoasters.map((coaster) => (
                  <div key={coaster.id} className="bg-slate-800/50 p-3 rounded-xl text-xs border border-white/10 hover:border-indigo-500/30 transition-all duration-200">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold text-white truncate">{coaster.name}</span>
                      <span className="text-slate-500 text-[10px]">
                        {new Date(coaster.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mb-3 flex gap-2 flex-wrap">
                      <span className="px-2 py-0.5 bg-indigo-500/20 rounded-full">{coaster.trackPoints.length} points</span>
                      {coaster.loopSegments?.length > 0 && <span className="px-2 py-0.5 bg-pink-500/20 rounded-full">{coaster.loopSegments.length} loops</span>}
                      {coaster.isLooped && <span className="px-2 py-0.5 bg-purple-500/20 rounded-full">Closed</span>}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => { loadCoaster(coaster.id); setShowLoadDialog(false); }}
                        className="h-7 text-[10px] px-3 flex-1 font-medium bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 shadow-lg shadow-emerald-500/25 transition-all duration-200"
                      >
                        Load
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleExport(coaster.id)}
                        className="h-7 text-[10px] px-3 font-medium bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-lg shadow-blue-500/25 transition-all duration-200"
                      >
                        Export
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => deleteCoaster(coaster.id)}
                        className="h-7 text-[10px] px-3 font-medium bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 text-red-400 transition-all duration-200"
                      >
                        🗑️
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div className="border-t border-white/10 pt-4 mt-4">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImport}
                accept=".json"
                className="hidden"
              />
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-9 text-[11px] font-medium bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 shadow-lg shadow-orange-500/25 transition-all duration-200 mb-3"
              >
                📥 Import from File
              </Button>
              <Button
                size="sm"
                onClick={() => setShowLoadDialog(false)}
                className="w-full h-8 text-[11px] font-medium bg-slate-700/50 hover:bg-slate-600/50 border border-white/10 transition-all duration-200"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Mini Map - Bottom Right */}
      <div className="absolute bottom-4 right-4 pointer-events-auto mini-map-container p-1">
        <MiniMap size={160} />
      </div>
      
      {/* Help Dialog */}
      {showHelpDialog && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-auto animate-fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowHelpDialog(false)} />
          <div className="relative glass-panel p-6 rounded-2xl text-white max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto shadow-2xl border border-indigo-500/20 custom-scrollbar">
            <h2 className="text-lg font-bold mb-5 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">❓ Help & Shortcuts</h2>
            
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <span className="w-6 h-6 bg-indigo-500/20 rounded-lg flex items-center justify-center text-xs">🎨</span>
                How to Build
              </h3>
              <ul className="text-[11px] text-slate-300 space-y-2 ml-8">
                <li className="flex items-start gap-2"><span className="text-indigo-400">•</span> Click on the ground to add track points</li>
                <li className="flex items-start gap-2"><span className="text-purple-400">•</span> Drag points up/down while holding mouse to set height</li>
                <li className="flex items-start gap-2"><span className="text-pink-400">•</span> Click a point to select it, then drag to reposition</li>
                <li className="flex items-start gap-2"><span className="text-cyan-400">•</span> Use the tilt slider on selected points for banking</li>
                <li className="flex items-start gap-2"><span className="text-emerald-400">•</span> Enable "Loop" to create a closed circuit</li>
                <li className="flex items-start gap-2"><span className="text-amber-400">•</span> Add vertical loops at any point for inversions</li>
              </ul>
            </div>
            
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <span className="w-6 h-6 bg-purple-500/20 rounded-lg flex items-center justify-center text-xs">⌨️</span>
                Keyboard Shortcuts
              </h3>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {KEYBOARD_SHORTCUTS.map((shortcut, i) => (
                  <div key={i} className="flex justify-between items-center bg-slate-800/50 px-3 py-2 rounded-lg border border-white/5">
                    <span className="font-mono text-indigo-400 font-semibold">{shortcut.key}</span>
                    <span className="text-slate-400">{shortcut.action}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <span className="w-6 h-6 bg-amber-500/20 rounded-lg flex items-center justify-center text-xs">💡</span>
                Pro Tips
              </h3>
              <ul className="text-[11px] text-slate-300 space-y-2 ml-8">
                <li className="flex items-start gap-2"><span className="text-amber-400">⭐</span> Start with a high first hill for chain lift momentum</li>
                <li className="flex items-start gap-2"><span className="text-amber-400">⭐</span> Keep grades under 60° for smooth riding</li>
                <li className="flex items-start gap-2"><span className="text-amber-400">⭐</span> Use banking (tilt) on turns for realism</li>
                <li className="flex items-start gap-2"><span className="text-amber-400">⭐</span> Save often! Your creations are stored locally</li>
                <li className="flex items-start gap-2"><span className="text-amber-400">⭐</span> Export to share coasters with others</li>
              </ul>
            </div>
            
            <Button
              size="sm"
              onClick={() => setShowHelpDialog(false)}
              className="w-full h-10 text-[12px] font-bold bg-gradient-to-r from-indigo-600 via-purple-500 to-pink-500 hover:from-indigo-500 hover:via-purple-400 hover:to-pink-400 shadow-lg shadow-purple-500/30 transition-all duration-200"
            >
              Got it! 🚀
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
