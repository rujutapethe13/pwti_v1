import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserOrganizationId } from "@/lib/organization";
import { createServiceClient } from "@/lib/supabase/server";
import { parseTimeRangeQuery } from "@/features/overview/time-range";
import { fetchVolumeBreakdown } from "@/features/overview/volume-breakdown-service";

export async function GET(request: NextRequest) {
  try {
    const organizationId = await getUserOrganizationId();
    if (!organizationId) {
      return NextResponse.json({ error: "Unable to determine organization. Please ensure you are a member of a workspace." }, { status: 401 });
    }
    const supabase = await createServiceClient();
    const range = parseTimeRangeQuery(request.nextUrl.searchParams);
    const boardIds = (request.nextUrl.searchParams.get("boards") ?? "")
      .split(",")
      .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
    const payload = await fetchVolumeBreakdown(supabase, { organizationId, range, boardIds: boardIds.length ? boardIds : null });
    return NextResponse.json(payload);
  } catch (err) {
    console.error("Overview volume breakdown error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load volume breakdown" }, { status: 500 });
  }
}
