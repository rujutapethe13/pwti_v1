import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/me/presence — heartbeat.
 *
 * Records that the caller is still here, which is what keeps `last_active_at`
 * fresh and what the green "Online" dot in the Members & access modal reads.
 *
 * The client pings on an interval while the tab is visible and stops when it is
 * hidden or the page unloads, so last_active_at means "active recently" rather
 * than "was ever signed in". `touch_user_activity()` additionally ignores
 * pings inside a 60 second window, so a chatty client costs one row write a
 * minute.
 *
 * No payload, and nothing returned beyond whether the write happened — this
 * endpoint must never be a channel for reading user data.
 */
export async function POST() {
  const supabase = await createClient(await cookies());

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const { data, error } = await supabase.rpc("touch_user_activity", {
    p_is_login: false,
  });

  if (error) {
    console.error("[me/presence] rpc failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to record presence", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, recorded: data === true });
}