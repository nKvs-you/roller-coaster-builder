import { useEffect, useCallback } from "react";
import { useRollerCoaster } from "@/lib/stores/useRollerCoaster";

export function useKeyboardShortcuts() {
  const {
    mode,
    selectedPointId,
    trackPoints,
    removeTrackPoint,
    duplicateTrackPoint,
    selectNextPoint,
    selectPrevPoint,
    selectPoint,
    undo,
    redo,
    canUndo,
    canRedo,
    setIsAddingPoints,
    isAddingPoints,
    startRide,
    stopRide,
    isRiding,
  } = useRollerCoaster();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      // Undo: Ctrl+Z
      if (ctrl && key === "z" && !shift) {
        e.preventDefault();
        if (canUndo()) {
          undo();
        }
        return;
      }

      // Redo: Ctrl+Shift+Z or Ctrl+Y
      if ((ctrl && shift && key === "z") || (ctrl && key === "y")) {
        e.preventDefault();
        if (canRedo()) {
          redo();
        }
        return;
      }

      // Only process remaining shortcuts in build mode
      if (mode !== "build") {
        // Escape or Space to exit ride
        if (isRiding && (key === "escape" || key === " ")) {
          e.preventDefault();
          stopRide();
        }
        return;
      }

      switch (key) {
        case "delete":
        case "backspace":
          e.preventDefault();
          if (selectedPointId) {
            removeTrackPoint(selectedPointId);
          }
          break;

        case "d":
          e.preventDefault();
          if (selectedPointId) {
            duplicateTrackPoint(selectedPointId);
          }
          break;

        case "escape":
          e.preventDefault();
          selectPoint(null);
          break;

        case "tab":
          e.preventDefault();
          if (shift) {
            selectPrevPoint();
          } else {
            selectNextPoint();
          }
          break;

        case "a":
          if (!ctrl) {
            e.preventDefault();
            setIsAddingPoints(!isAddingPoints);
          }
          break;

        case " ": // Space
          e.preventDefault();
          if (trackPoints.length >= 2) {
            startRide();
          }
          break;

        case "arrowleft":
        case "arrowup":
          e.preventDefault();
          selectPrevPoint();
          break;

        case "arrowright":
        case "arrowdown":
          e.preventDefault();
          selectNextPoint();
          break;
      }
    },
    [
      mode,
      selectedPointId,
      trackPoints,
      removeTrackPoint,
      duplicateTrackPoint,
      selectNextPoint,
      selectPrevPoint,
      selectPoint,
      undo,
      redo,
      canUndo,
      canRedo,
      setIsAddingPoints,
      isAddingPoints,
      startRide,
      stopRide,
      isRiding,
    ]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

export const KEYBOARD_SHORTCUTS = [
  { key: "Delete / Backspace", action: "Delete selected point" },
  { key: "D", action: "Duplicate selected point" },
  { key: "Tab / Arrow keys", action: "Select next/prev point" },
  { key: "Shift+Tab", action: "Select previous point" },
  { key: "A", action: "Toggle add points mode" },
  { key: "Space", action: "Start/stop ride" },
  { key: "Escape", action: "Deselect / Exit ride" },
  { key: "Ctrl+Z", action: "Undo" },
  { key: "Ctrl+Shift+Z", action: "Redo" },
];
