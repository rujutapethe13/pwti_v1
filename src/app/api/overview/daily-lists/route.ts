import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserOrganizationId } from "@/lib/organization";
import { createServiceClient } from "@/lib/supabase/server";
import { isDailyListPanelId } from "@/features/overview/daily-lists";
import { fetchDailyListPanel } from "@/features/overview/daily-lists-service";

export async function GET(request: NextRequest) {
  try {
    const panel = request.nextUrl.searchParams.get("panel");
    if (!isDailyListPanelId(panel)) {
      return NextResponse.json({ error: "Unknown panel. Expected one of: today, overdue, upcoming." }, { status: 400 });
    }
    const organizationId = await getUserOrganizationId();
    if (!organizationId) {
      return NextResponse.json({ error: "Unable to determine organization. Please ensure you are a member of a workspace." }, { status: 401 });
    }
    const supabase = await createServiceClient();
    const result = await fetchDailyListPanel(supabase, { organizationId, panel });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Overview daily list error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load daily activity" }, { status: 500 });
  }
}
