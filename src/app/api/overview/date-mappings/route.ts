import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserOrganizationId } from "@/lib/organization";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchBoardDateMappings } from "@/features/overview/board-date-mappings";

export async function GET(_request: NextRequest) {
  try {
    const organizationId = await getUserOrganizationId();
    if (!organizationId) {
      return NextResponse.json(
        { error: "Unable to determine organization." },
        { status: 401 },
      );
    }
    const supabase = await createServiceClient();
    const rows = await fetchBoardDateMappings(organizationId, supabase);
    return NextResponse.json({ rows });
  } catch (err) {
    console.error("Board date mappings error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load date mappings" },
      { status: 500 },
    );
  }
}