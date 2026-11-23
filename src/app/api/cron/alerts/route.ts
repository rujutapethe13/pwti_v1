import { NextResponse } from "next/server";

import { runAlertDigest } from "@/features/email-alerts/run";

/**
 * Daily alert cron (vercel.json → 03:30 UTC ≈ 09:00 IST).
 *
 * Protection: a CRON_SECRET bearer token is required. Vercel Cron sends
 * `Authorization: Bearer <CRON_SECRET>` automatically when the env var is set;
 * the `x-cron-secret` header is also accepted for manual runs, matching the
 * existing /api/cron/triggers convention. Every other caller gets a 401.
 *
 * `?dry=1` (authorized callers only) runs detection and rendering without
 * sending email or writing log rows.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");

  const bearerOk = Boolean(expected) && authorization === `Bearer ${expected}`;
  const headerOk = Boolean(expected) && cronHeader === expected;
  if (!bearerOk && !headerOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dry") === "1";

  try {
    const summary = await runAlertDigest({ dryRun });
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[email-alerts] cron run failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Alert run failed" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}