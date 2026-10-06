import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { hasUnsavedChanges, useHasUnsavedChanges, useUnsavedChanges } from "@/lib/unsaved-changes";

describe("unsaved-changes", () => {
  beforeEach(() => {
    vi.clearAllTimers();
  });

  describe("hasUnsavedChanges", () => {
    it("returns false when no forms are dirty", () => {
      expect(hasUnsavedChanges()).toBe(false);
    });
  });

  describe("useUnsavedChanges", () => {
    it("increments the dirty count while mounted and dirty", async () => {
      const { unmount } = renderHook(() => useUnsavedChanges(true));

      expect(hasUnsavedChanges()).toBe(true);

      unmount();
      expect(hasUnsavedChanges()).toBe(false);
    });

    it("does not increment when the form is clean", () => {
      const { unmount } = renderHook(() => useUnsavedChanges(false));

      expect(hasUnsavedChanges()).toBe(false);

      unmount();
      expect(hasUnsavedChanges()).toBe(false);
    });

    it("allows two forms to be dirty independently", () => {
      const { unmount: unmountA } = renderHook(() => useUnsavedChanges(true));
      const { unmount: unmountB } = renderHook(() => useUnsavedChanges(true));

      expect(hasUnsavedChanges()).toBe(true);

      unmountA();
      expect(hasUnsavedChanges()).toBe(true);

      unmountB();
      expect(hasUnsavedChanges()).toBe(false);
    });
  });

  describe("useHasUnsavedChanges", () => {
    it("re-renders when another form becomes dirty", async () => {
      const { unmount: unmountA } = renderHook(() => useHasUnsavedChanges());
      const { unmount: unmountB } = renderHook(() => useUnsavedChanges(true));

      await waitFor(() => {
        expect(hasUnsavedChanges()).toBe(true);
      });

      unmountB();
      await waitFor(() => {
        expect(hasUnsavedChanges()).toBe(false);
      });

      unmountA();
    });
  });
});