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

/**
 * Extract a human-readable message from an unknown thrown value.
 *
 * Supabase rejects with `PostgrestError` (a plain object carrying `message`,
 * `details` and `hint`) while application code usually throws real `Error`
 * instances. This narrows both shapes without casting to `any`, and falls back
 * to `fallback` when no message can be determined.
 */
export function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === "object" && err !== null) {
    const { message, details, hint } = err as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    if (typeof message === "string" && message) {
      const extras = [details, hint].filter(
        (part): part is string => typeof part === "string" && part.length > 0,
      );
      return extras.length > 0 ? `${message} (${extras.join(" — ")})` : message;
    }
  }
  return fallback;
}

