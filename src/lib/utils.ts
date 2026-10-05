/**
 * Utility helpers
 *
 * `cn` is the central classname merge function used across all components.
 * Combines `clsx` (conditional classes) with `tailwind-merge` (resolves
 * Tailwind conflicts intelligently).
 *
 * ── Usage ──────────────────────────────────────────────────
 *   cn("px-4 py-2", isActive && "bg-accent", className)
 * ────────────────────────────────────────────────────────────
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

