import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL("/signin?error=invalid_link", request.url));
  }

  const supabase = await createClient(await cookies());
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as "signup" | "magiclink" | "email" | "recovery" | "invite",
  });

  if (error) {
    return NextResponse.redirect(new URL("/signin?error=verification_failed", request.url));
  }

  return NextResponse.redirect(new URL("/signin?verified=true", request.url));
}
