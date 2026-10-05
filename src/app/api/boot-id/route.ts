/**
 * GET /api/boot-id
 *
 * Returns the current server process boot ID. The value is generated once per
 * server process (see `@/lib/boot-id`) and only changes on an actual server
 * restart — not on page refresh or HMR.
 *
 * The client calls this on app load and compares the result to a boot ID it
 * previously stored in localStorage. A mismatch means the server restarted, so
 * any stale persisted "row item" data is considered out-of-sync and is wiped
 * (see `@/lib/boot-sync`).
 */
import { NextResponse } from "next/server";

import BOOT_ID from "@/lib/boot-id";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ bootId: BOOT_ID });
}
