"use client";

import { useCallback, useState } from "react";

export interface UndoAction {
  id: string;
  type: string;
  description: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

interface UseUndoStackReturn {
  past: UndoAction[];
  future: UndoAction[];
  pushAction: (action: UndoAction) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  clear: () => void;
  lastAction: UndoAction | null;
}

const MAX_STACK_SIZE = 50;

export function useUndoStack(): UseUndoStackReturn {
  const [past, setPast] = useState<UndoAction[]>([]);
  const [future, setFuture] = useState<UndoAction[]>([]);

  const pushAction = useCallback((action: UndoAction) => {
    setPast((prev) => [action, ...prev].slice(0, MAX_STACK_SIZE));
    setFuture([]);
  }, []);

  const undo = useCallback(async () => {
    setPast((prev) => {
      if (prev.length === 0) return prev;
      const [action, ...rest] = prev;
      action.undo().catch(console.error);
      setFuture((f) => [action, ...f]);
      return rest;
    });
  }, []);

  const redo = useCallback(async () => {
    setFuture((prev) => {
      if (prev.length === 0) return prev;
      const [action, ...rest] = prev;
      action.redo().catch(console.error);
      setPast((p) => [action, ...p]);
      return rest;
    });
  }, []);

  return {
    past,
    future,
    pushAction,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    clear: useCallback(() => {
      setPast([]);
      setFuture([]);
    }, []),
    lastAction: past.length > 0 ? past[0] : null,
  };
}

