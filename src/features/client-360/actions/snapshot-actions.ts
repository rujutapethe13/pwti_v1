"use server";

import { createServiceClient } from "@/lib/supabase/server";

export async function refreshClient360Snapshot(): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient();

    const { data: state } = await supabase
      .from("client_360_refresh_state")
      .select("needs_refresh")
      .eq("id", true)
      .maybeSingle();

    if (state?.needs_refresh) {
      console.warn("[Client 360] Snapshot is stale — refreshing...");
      const { error } = await supabase.rpc("refresh_client_360_snapshot");

      if (error) {
        return { success: false, error: error.message };
      }

      await supabase
        .from("client_360_refresh_state")
        .update({ needs_refresh: false, updated_at: new Date().toISOString() })
        .eq("id", true);
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to refresh snapshot";
    console.warn("[Client 360] Snapshot refresh check failed:", err);
    return { success: false, error: message };
  }
}