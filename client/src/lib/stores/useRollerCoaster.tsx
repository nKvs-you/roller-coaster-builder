import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import * as THREE from "three";

export type CoasterMode = "build" | "ride" | "preview";

// History entry for undo/redo
interface HistoryEntry {
  trackPoints: SerializedTrackPoint[];
  loopSegments: SerializedLoopSegment[];
  isLooped: boolean;
}

// Loop segment descriptor - stored separately from track points
// The actual loop frame (forward, up, right) is computed at runtime from the spline
// Uses corkscrew helix geometry: advances forward by 'pitch' while rotating 360 degrees
export interface LoopSegment {
  id: string;
  entryPointId: string;  // ID of track point where loop starts
  radius: number;
  pitch: number;  // Forward distance traveled during one full rotation (prevents intersection)
}

export interface TrackPoint {
  id: string;
  position: THREE.Vector3;
  tilt: number;
  hasLoop?: boolean;  // True if a loop starts at this point
}

// Serializable versions for JSON storage
interface SerializedLoopSegment {
  id: string;
  entryPointId: string;
  radius: number;
  pitch: number;
}

interface SerializedTrackPoint {
  id: string;
  position: [number, number, number];
  tilt: number;
  hasLoop?: boolean;
}

export interface SavedCoaster {
  id: string;
  name: string;
  timestamp: number;
  trackPoints: SerializedTrackPoint[];
  loopSegments: SerializedLoopSegment[];
  isLooped: boolean;
  hasChainLift: boolean;
  showWoodSupports: boolean;
}

// Serialization helpers
function serializeVector3(v: THREE.Vector3): [number, number, number] {
  return [v.x, v.y, v.z];
}

function deserializeVector3(arr: [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(arr[0], arr[1], arr[2]);
}

function serializeTrackPoint(point: TrackPoint): SerializedTrackPoint {
  return {
    id: point.id,
    position: serializeVector3(point.position),
    tilt: point.tilt,
    hasLoop: point.hasLoop,
  };
}

function deserializeTrackPoint(serialized: SerializedTrackPoint): TrackPoint {
  return {
    id: serialized.id,
    position: deserializeVector3(serialized.position),
    tilt: serialized.tilt,
    hasLoop: serialized.hasLoop,
  };
}

function serializeLoopSegment(segment: LoopSegment): SerializedLoopSegment {
  return {
    id: segment.id,
    entryPointId: segment.entryPointId,
    radius: segment.radius,
    pitch: segment.pitch,
  };
}

function deserializeLoopSegment(serialized: SerializedLoopSegment): LoopSegment {
  return {
    id: serialized.id,
    entryPointId: serialized.entryPointId,
    radius: serialized.radius,
    pitch: serialized.pitch ?? 12,  // Default pitch for backwards compatibility
  };
}

const STORAGE_KEY = "roller_coaster_saves";

function loadSavedCoasters(): SavedCoaster[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function persistSavedCoasters(coasters: SavedCoaster[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(coasters));
}

interface RollerCoasterState {
  mode: CoasterMode;
  trackPoints: TrackPoint[];
  loopSegments: LoopSegment[];
  selectedPointId: string | null;
  rideProgress: number;
  isRiding: boolean;
  rideSpeed: number;
  isDraggingPoint: boolean;
  isAddingPoints: boolean;
  isLooped: boolean;
  hasChainLift: boolean;
  showWoodSupports: boolean;
  isNightMode: boolean;
  cameraTarget: THREE.Vector3 | null;
  savedCoasters: SavedCoaster[];
  currentCoasterName: string | null;
  
  // Undo/redo state
  history: HistoryEntry[];
  historyIndex: number;
  maxHistorySize: number;
  
  setMode: (mode: CoasterMode) => void;
  setCameraTarget: (target: THREE.Vector3 | null) => void;
  addTrackPoint: (position: THREE.Vector3) => void;
  insertTrackPointAfter: (afterId: string, position: THREE.Vector3) => void;
  duplicateTrackPoint: (id: string) => void;
  updateTrackPoint: (id: string, position: THREE.Vector3) => void;
  updateTrackPointTilt: (id: string, tilt: number) => void;
  removeTrackPoint: (id: string) => void;
  createLoopAtPoint: (id: string) => void;
  removeLoopAtPoint: (id: string) => void;
  selectPoint: (id: string | null) => void;
  selectNextPoint: () => void;
  selectPrevPoint: () => void;
  clearTrack: () => void;
  setRideProgress: (progress: number) => void;
  setIsRiding: (riding: boolean) => void;
  setRideSpeed: (speed: number) => void;
  setIsDraggingPoint: (dragging: boolean) => void;
  setIsAddingPoints: (adding: boolean) => void;
  setIsLooped: (looped: boolean) => void;
  setHasChainLift: (hasChain: boolean) => void;
  setShowWoodSupports: (show: boolean) => void;
  setIsNightMode: (night: boolean) => void;
  startRide: () => void;
  stopRide: () => void;
  
  // Undo/redo functions
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  pushHistory: () => void;
  
  // Save/Load functionality
  saveCoaster: (name: string) => void;
  loadCoaster: (id: string) => void;
  deleteCoaster: (id: string) => void;
  exportCoaster: (id: string) => string | null;
  importCoaster: (jsonString: string) => boolean;
  refreshSavedCoasters: () => void;
}

let pointCounter = 0;

// Helper to create initial history entry
function createHistoryEntry(state: { 
  trackPoints: TrackPoint[]; 
  loopSegments: LoopSegment[]; 
  isLooped: boolean 
}): HistoryEntry {
  return {
    trackPoints: state.trackPoints.map(serializeTrackPoint),
    loopSegments: state.loopSegments.map(serializeLoopSegment),
    isLooped: state.isLooped,
  };
}

export const useRollerCoaster = create<RollerCoasterState>()(
  subscribeWithSelector((set, get) => ({
  mode: "build",
  trackPoints: [],
  loopSegments: [],
  selectedPointId: null,
  rideProgress: 0,
  isRiding: false,
  rideSpeed: 1.0,
  isDraggingPoint: false,
  isAddingPoints: true,
  isLooped: false,
  hasChainLift: true,
  showWoodSupports: false,
  isNightMode: false,
  cameraTarget: null,
  savedCoasters: loadSavedCoasters(),
  currentCoasterName: null,
  
  // Undo/redo state
  history: [],
  historyIndex: -1,
  maxHistorySize: 50,
  
  setMode: (mode) => set({ mode }),
  
  setCameraTarget: (target) => set({ cameraTarget: target }),
  
  setIsDraggingPoint: (dragging) => set({ isDraggingPoint: dragging }),
  
  setIsAddingPoints: (adding) => set({ isAddingPoints: adding }),
  
  setIsLooped: (looped) => set({ isLooped: looped }),
  
  setHasChainLift: (hasChain) => set({ hasChainLift: hasChain }),
  
  setShowWoodSupports: (show) => set({ showWoodSupports: show }),
  
  setIsNightMode: (night) => set({ isNightMode: night }),
  
  addTrackPoint: (position) => {
    const state = get();
    state.pushHistory();
    const id = `point-${++pointCounter}`;
    set((state) => ({
      trackPoints: [...state.trackPoints, { id, position: position.clone(), tilt: 0 }],
    }));
  },
  
  updateTrackPoint: (id, position) => {
    // Don't push history on every drag update - it's done on drag end
    set((state) => ({
      trackPoints: state.trackPoints.map((point) =>
        point.id === id ? { ...point, position: position.clone() } : point
      ),
    }));
  },
  
  updateTrackPointTilt: (id, tilt) => {
    const state = get();
    state.pushHistory();
    set((state) => ({
      trackPoints: state.trackPoints.map((point) =>
        point.id === id ? { ...point, tilt } : point
      ),
    }));
  },
  
  removeTrackPoint: (id) => {
    const state = get();
    state.pushHistory();
    set((state) => ({
      trackPoints: state.trackPoints.filter((point) => point.id !== id),
      loopSegments: state.loopSegments.filter((seg) => seg.entryPointId !== id),
      selectedPointId: state.selectedPointId === id ? null : state.selectedPointId,
    }));
  },
  
  createLoopAtPoint: (id) => {
    const currentState = get();
    currentState.pushHistory();
    set((state) => {
      const pointIndex = state.trackPoints.findIndex((p) => p.id === id);
      if (pointIndex === -1) return state;
      
      const entryPoint = state.trackPoints[pointIndex];
      if (entryPoint.hasLoop) return state;
      
      const loopRadius = 5;
      const loopPitch = 12;  // Forward distance during one rotation (prevents intersection)
      
      const loopSegment: LoopSegment = {
        id: `loop-${Date.now()}`,
        entryPointId: id,
        radius: loopRadius,
        pitch: loopPitch,
      };
      
      const newTrackPoints = state.trackPoints.map((p) =>
        p.id === id ? { ...p, hasLoop: true } : p
      );
      
      return {
        trackPoints: newTrackPoints,
        loopSegments: [...state.loopSegments, loopSegment],
      };
    });
  },
  
  removeLoopAtPoint: (id) => {
    const currentState = get();
    currentState.pushHistory();
    set((state) => {
      const point = state.trackPoints.find((p) => p.id === id);
      if (!point || !point.hasLoop) return state;
      
      return {
        trackPoints: state.trackPoints.map((p) =>
          p.id === id ? { ...p, hasLoop: false } : p
        ),
        loopSegments: state.loopSegments.filter((seg) => seg.entryPointId !== id),
      };
    });
  },
  
  insertTrackPointAfter: (afterId, position) => {
    const state = get();
    state.pushHistory();
    const id = `point-${++pointCounter}`;
    set((state) => {
      const index = state.trackPoints.findIndex((p) => p.id === afterId);
      if (index === -1) {
        return { trackPoints: [...state.trackPoints, { id, position: position.clone(), tilt: 0 }] };
      }
      const newPoints = [...state.trackPoints];
      newPoints.splice(index + 1, 0, { id, position: position.clone(), tilt: 0 });
      return { trackPoints: newPoints, selectedPointId: id };
    });
  },
  
  duplicateTrackPoint: (id) => {
    const state = get();
    state.pushHistory();
    const newId = `point-${++pointCounter}`;
    set((state) => {
      const index = state.trackPoints.findIndex((p) => p.id === id);
      if (index === -1) return state;
      
      const sourcePoint = state.trackPoints[index];
      const nextPoint = state.trackPoints[index + 1];
      
      // Calculate offset position - either towards next point or along tangent
      let newPosition: THREE.Vector3;
      if (nextPoint) {
        // Place between current and next
        newPosition = sourcePoint.position.clone().lerp(nextPoint.position, 0.5);
      } else {
        // Place 3 units in the direction of the previous tangent
        const prevPoint = state.trackPoints[index - 1];
        if (prevPoint) {
          const dir = sourcePoint.position.clone().sub(prevPoint.position).normalize();
          newPosition = sourcePoint.position.clone().add(dir.multiplyScalar(3));
        } else {
          newPosition = sourcePoint.position.clone().add(new THREE.Vector3(3, 0, 0));
        }
      }
      
      const newPoints = [...state.trackPoints];
      newPoints.splice(index + 1, 0, { 
        id: newId, 
        position: newPosition, 
        tilt: sourcePoint.tilt 
      });
      return { trackPoints: newPoints, selectedPointId: newId };
    });
  },
  
  selectPoint: (id) => set({ selectedPointId: id }),
  
  selectNextPoint: () => {
    const state = get();
    if (state.trackPoints.length === 0) return;
    
    if (!state.selectedPointId) {
      set({ selectedPointId: state.trackPoints[0].id });
      return;
    }
    
    const currentIndex = state.trackPoints.findIndex((p) => p.id === state.selectedPointId);
    const nextIndex = (currentIndex + 1) % state.trackPoints.length;
    set({ selectedPointId: state.trackPoints[nextIndex].id });
  },
  
  selectPrevPoint: () => {
    const state = get();
    if (state.trackPoints.length === 0) return;
    
    if (!state.selectedPointId) {
      set({ selectedPointId: state.trackPoints[state.trackPoints.length - 1].id });
      return;
    }
    
    const currentIndex = state.trackPoints.findIndex((p) => p.id === state.selectedPointId);
    const prevIndex = currentIndex <= 0 ? state.trackPoints.length - 1 : currentIndex - 1;
    set({ selectedPointId: state.trackPoints[prevIndex].id });
  },
  
  clearTrack: () => {
    const state = get();
    state.pushHistory();
    set({ trackPoints: [], loopSegments: [], selectedPointId: null, rideProgress: 0, isRiding: false, history: [], historyIndex: -1 });
  },
  
  setRideProgress: (progress) => set({ rideProgress: progress }),
  
  setIsRiding: (riding) => set({ isRiding: riding }),
  
  setRideSpeed: (speed) => set({ rideSpeed: speed }),
  
  startRide: () => {
    const { trackPoints } = get();
    if (trackPoints.length >= 2) {
      set({ mode: "ride", isRiding: true, rideProgress: 0 });
    }
  },
  
  stopRide: () => {
    set({ mode: "build", isRiding: false, rideProgress: 0 });
  },
  
  // Save/Load functionality
  saveCoaster: (name: string) => {
    const state = get();
    const id = `coaster-${Date.now()}`;
    const savedCoaster: SavedCoaster = {
      id,
      name,
      timestamp: Date.now(),
      trackPoints: state.trackPoints.map(serializeTrackPoint),
      loopSegments: state.loopSegments.map(serializeLoopSegment),
      isLooped: state.isLooped,
      hasChainLift: state.hasChainLift,
      showWoodSupports: state.showWoodSupports,
    };
    
    const coasters = loadSavedCoasters();
    coasters.push(savedCoaster);
    persistSavedCoasters(coasters);
    
    set({ savedCoasters: coasters, currentCoasterName: name });
  },
  
  loadCoaster: (id: string) => {
    try {
      const coasters = loadSavedCoasters();
      const coaster = coasters.find(c => c.id === id);
      if (!coaster || !Array.isArray(coaster.trackPoints)) return;
      
      const trackPoints = coaster.trackPoints.map(deserializeTrackPoint);
      const loopSegments = (coaster.loopSegments || []).map(deserializeLoopSegment);
      
      // Update pointCounter to avoid ID collisions
      const maxId = trackPoints.reduce((max, p) => {
        const num = parseInt(p.id.replace('point-', ''), 10);
        return isNaN(num) ? max : Math.max(max, num);
      }, 0);
      pointCounter = maxId;
      
      set({
        trackPoints,
        loopSegments,
        isLooped: Boolean(coaster.isLooped),
        hasChainLift: coaster.hasChainLift !== false,
        showWoodSupports: Boolean(coaster.showWoodSupports),
        currentCoasterName: coaster.name || "Untitled",
        selectedPointId: null,
        rideProgress: 0,
        isRiding: false,
        mode: "build",
      });
    } catch (e) {
      console.error("Failed to load coaster:", e);
    }
  },
  
  deleteCoaster: (id: string) => {
    const coasters = loadSavedCoasters().filter(c => c.id !== id);
    persistSavedCoasters(coasters);
    set({ savedCoasters: coasters });
  },
  
  exportCoaster: (id: string) => {
    const coasters = loadSavedCoasters();
    const coaster = coasters.find(c => c.id === id);
    if (!coaster) return null;
    return JSON.stringify(coaster, null, 2);
  },
  
  importCoaster: (jsonString: string) => {
    try {
      const coaster = JSON.parse(jsonString);
      
      // Validate required fields
      if (!coaster || typeof coaster !== 'object') return false;
      if (typeof coaster.name !== 'string' || !coaster.name.trim()) return false;
      if (!Array.isArray(coaster.trackPoints)) return false;
      
      // Validate each track point has required structure
      for (const pt of coaster.trackPoints) {
        if (!pt || typeof pt !== 'object') return false;
        if (!Array.isArray(pt.position) || pt.position.length !== 3) return false;
        if (!pt.position.every((n: unknown) => typeof n === 'number' && isFinite(n))) return false;
        if (typeof pt.tilt !== 'number') return false;
        if (typeof pt.id !== 'string') return false;
        
        // Validate loopMeta if present
        if (pt.loopMeta) {
          const lm = pt.loopMeta;
          if (!Array.isArray(lm.entryPos) || lm.entryPos.length !== 3) return false;
          if (!Array.isArray(lm.forward) || lm.forward.length !== 3) return false;
          if (!Array.isArray(lm.up) || lm.up.length !== 3) return false;
          if (!Array.isArray(lm.right) || lm.right.length !== 3) return false;
          if (typeof lm.radius !== 'number' || typeof lm.theta !== 'number') return false;
        }
      }
      
      // Assign new ID to avoid conflicts
      const validCoaster: SavedCoaster = {
        id: `coaster-${Date.now()}`,
        name: coaster.name.trim(),
        timestamp: Date.now(),
        trackPoints: coaster.trackPoints,
        loopSegments: coaster.loopSegments || [],
        isLooped: Boolean(coaster.isLooped),
        hasChainLift: coaster.hasChainLift !== false,
        showWoodSupports: Boolean(coaster.showWoodSupports),
      };
      
      const coasters = loadSavedCoasters();
      coasters.push(validCoaster);
      persistSavedCoasters(coasters);
      set({ savedCoasters: coasters });
      return true;
    } catch {
      return false;
    }
  },
  
  refreshSavedCoasters: () => {
    set({ savedCoasters: loadSavedCoasters() });
  },
  
  // Undo/redo functionality
  pushHistory: () => {
    const state = get();
    const entry = createHistoryEntry(state);
    
    // Remove any future history if we're not at the end
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(entry);
    
    // Limit history size
    while (newHistory.length > state.maxHistorySize) {
      newHistory.shift();
    }
    
    set({ 
      history: newHistory, 
      historyIndex: newHistory.length - 1 
    });
  },
  
  canUndo: () => {
    const state = get();
    return state.historyIndex >= 0;
  },
  
  canRedo: () => {
    const state = get();
    return state.historyIndex < state.history.length - 1;
  },
  
  undo: () => {
    const state = get();
    if (state.historyIndex < 0) return;
    
    const entry = state.history[state.historyIndex];
    const trackPoints = entry.trackPoints.map(deserializeTrackPoint);
    const loopSegments = entry.loopSegments.map(deserializeLoopSegment);
    
    // Update pointCounter to avoid collisions
    const maxId = trackPoints.reduce((max, p) => {
      const num = parseInt(p.id.replace('point-', ''), 10);
      return isNaN(num) ? max : Math.max(max, num);
    }, pointCounter);
    pointCounter = maxId;
    
    set({
      trackPoints,
      loopSegments,
      isLooped: entry.isLooped,
      historyIndex: state.historyIndex - 1,
      selectedPointId: null,
    });
  },
  
  redo: () => {
    const state = get();
    if (state.historyIndex >= state.history.length - 1) return;
    
    const entry = state.history[state.historyIndex + 1];
    if (!entry) return;
    
    const trackPoints = entry.trackPoints.map(deserializeTrackPoint);
    const loopSegments = entry.loopSegments.map(deserializeLoopSegment);
    
    // Update pointCounter
    const maxId = trackPoints.reduce((max, p) => {
      const num = parseInt(p.id.replace('point-', ''), 10);
      return isNaN(num) ? max : Math.max(max, num);
    }, pointCounter);
    pointCounter = maxId;
    
    set({
      trackPoints,
      loopSegments,
      isLooped: entry.isLooped,
      historyIndex: state.historyIndex + 1,
      selectedPointId: null,
    });
  },
})));
