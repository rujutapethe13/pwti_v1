import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

async function currentUser() {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user) return fail("Authentication required", 401);

  await params;
  const db = await createServiceClient();
  return NextResponse.json({ success: true });
}
