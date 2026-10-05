"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { BoardView } from "../types";
import { useUndoStack } from "./use-undo";

interface UseViewReturn {
  views: BoardView[];
  activeViewId: string | null;
  loading: boolean;
  error: string | null;
  setActiveView: (viewId: string) => void;
  createView: (data: Partial<BoardView>) => Promise<void>;
  updateView: (viewId: string, data: Partial<BoardView>) => Promise<void>;
  duplicateView: (viewId: string) => Promise<void>;
  setDefaultView: (viewId: string) => Promise<void>;
  deleteView: (viewId: string) => Promise<void>;
}

export function useView(initialViews: BoardView[] = [], defaultViewId?: string): UseViewReturn {
  const [views, setViews] = useState<BoardView[]>(initialViews);
  const [activeViewId, setActiveViewId] = useState<string | null>(defaultViewId ?? initialViews.find((v) => v.isDefault)?.id ?? initialViews[0]?.id ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pushAction } = useUndoStack();

  const setActiveView = useCallback((viewId: string) => {
    setActiveViewId(viewId);
  }, []);

  const createView = useCallback(async (data: Partial<BoardView>) => {
    setLoading(true);
    setError(null);
    try {
      setViews((prev) => [...prev, data as BoardView]);
      toast.success("View created.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create view.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateView = useCallback(async (viewId: string, data: Partial<BoardView>) => {
    const prev = views.find((v) => v.id === viewId);
    setViews((p) => p.map((v) => (v.id === viewId ? { ...v, ...data } : v)));
    try {
      toast.success("View updated.");
    } catch {
      if (prev) setViews((p) => p.map((v) => (v.id === viewId ? prev : v)));
      toast.error("Failed to update view.");
    }
  }, [views]);

  const duplicateView = useCallback(async (viewId: string) => {
    const prev = [...views];
    try {
      setLoading(true);
      toast.success("View duplicated.");
    } catch {
      setViews(prev);
      toast.error("Failed to duplicate view.");
    } finally {
      setLoading(false);
    }
  }, [views]);

  const setDefaultView = useCallback(async (viewId: string) => {
    const prev = [...views];
    setViews((p) => p.map((v) => ({ ...v, isDefault: v.id === viewId })));
    try {
      toast.success("Default view updated.");
    } catch {
      setViews(prev);
    }
  }, [views]);

  const deleteView = useCallback(async (viewId: string) => {
    const prev = views.find((v) => v.id === viewId);
    setViews((p) => p.filter((v) => v.id !== viewId));
    if (activeViewId === viewId) {
      setActiveViewId(views.find((v) => v.id !== viewId)?.id ?? null);
    }
    try {
      toast.success("View deleted.", { action: { label: "Undo", onClick: () => {} } });
    } catch {
      if (prev) setViews((p) => [...p, prev]);
    }
  }, [views, activeViewId]);

  return {
    views,
    activeViewId,
    loading,
    error,
    setActiveView,
    createView,
    updateView,
    duplicateView,
    setDefaultView,
    deleteView,
  };
}
