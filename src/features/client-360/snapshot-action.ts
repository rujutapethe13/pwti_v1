"use server";

import { buildAbsoluteUrl } from "@/lib/url";
import type { Client360Snapshot } from "./types";

/**
 * Fetch the aggregated Client 360 snapshot for a date range.
 *
 * When `start` and `end` are omitted the route defaults server-side to
 * today (single-day mode).
 */
export async function fetchClient360SnapshotAction(
  options: { start?: string; end?: string } = {},
): Promise<{ data: Client360Snapshot | null; error: string | null; status: number }> {
  try {
    const params = new URLSearchParams();
    if (options.start) params.set("start", options.start);
    if (options.end) params.set("end", options.end);

    const qs = params.toString();
    const url = qs
      ? await buildAbsoluteUrl(`/api/client-360/snapshot?${qs}`)
      : await buildAbsoluteUrl("/api/client-360/snapshot");

    const res = await fetch(url, { method: "GET", cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        data: null,
        error: (body as { error?: string }).error ?? "Failed to fetch snapshot",
        status: res.status,
      };
    }

    const data = (await res.json()) as Client360Snapshot;
    return { data, error: null, status: 200 };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("Client 360 snapshot fetch failed:", err);
    return {
      data: null,
      error: `Failed to fetch snapshot data: ${reason}`,
      status: 500,
    };
  }
}
