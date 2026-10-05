import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserOrganizationId } from "@/lib/organization";
import { fetchClient360DailyActivity } from "@/features/client-360/daily-activity-service";
import type { Client360DailyActivity } from "@/features/client-360/types";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const selectedDate = searchParams.get("selectedDate");
    const clientId = searchParams.get("clientId");

    if (selectedDate && Number.isNaN(new Date(selectedDate).getTime())) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid selectedDate. Expected a date in YYYY-MM-DD format.",
          details: null,
        },
        { status: 400 },
      );
    }

    const organizationId = await getUserOrganizationId();
    if (!organizationId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unable to determine organization. Please ensure you are a member of a workspace.",
          details: null,
        },
        { status: 401 },
      );
    }

    try {
      const data: Client360DailyActivity = await fetchClient360DailyActivity({
        selectedDate: selectedDate ?? undefined,
        clientId: clientId ?? undefined,
        organizationId,
      });
      return NextResponse.json({ success: true, data }, { status: 200 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Failed to build daily activity response:", err);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch daily activity data",
          details: message,
        },
        { status: 500 },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Daily activity route error:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch daily activity data",
        details: message,
      },
      { status: 500 },
    );
  }
}
