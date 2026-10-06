import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { revokeOtherSessions } from "@/lib/account-server";

/**
 * POST /api/me/sessions/revoke-others?device_id=<current device>
 *
 * Revokes every refresh token except the one making this request.
 *
 * The revocation itself is done by Supabase Auth (`scope: 'others'`), not by
 * deleting rows: `signOut({ scope: 'others' })` keeps the calling session
 * alive, which is the whole point of the button. The `user_sessions` rows are
 * cleaned up afterwards so the list on the next load matches reality.
 *
 * Note that Supabase's refresh tokens are not individually addressable, so this
 * cannot revoke "one other device" — it revokes all of them, which is what the
 * button says it does.
 */

export async function POST(request: Request) {
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

  const deviceId = new URL(request.url).searchParams.get("device_id");

  const { error } = await supabase.auth.signOut({ scope: "others" });

  if (error) {
    console.error("[account] sign out other devices failed:", error.message);
    return NextResponse.json(
      { success: false, error: "Could not sign out other devices" },
      { status: 500 },
    );
  }

  await revokeOtherSessions(user.id, deviceId);

  return NextResponse.json({ success: true });
}