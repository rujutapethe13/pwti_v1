"use client";

import { useEffect } from "react";

import { runStatusLabelMigration } from "@/features/boards/engine/lib/status-label-migration";

/**
 * Runs the one-time Status label migration on app load.
 *
 * Mounted in the root layout so the repair happens once per app load,
 * independently of which board the user opens.
 */
export function StatusLabelMigration() {
  useEffect(() => {
    void runStatusLabelMigration();
  }, []);

  return null;
}
