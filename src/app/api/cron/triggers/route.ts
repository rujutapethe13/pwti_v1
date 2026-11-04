import { NextRequest, NextResponse } from "next/server";
import { listTriggers } from "@/features/triggers/storage";
import { runTrigger } from "@/features/triggers/engine";

/**
 * Cron endpoint: runs every enabled automatic trigger.
 * Protect with the CRON_SECRET header (see .env.local). Wire it to Vercel Cron
 * or Windows Task Scheduler hitting https://<app>/api/cron/triggers every day.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-cron-secret") || req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const triggers = await listTriggers();
    const automatic = triggers.filter((t) => t.enabled && (t.runMode === "automatic" || t.runMode === "both"));

    const results = await Promise.allSettled(
      automatic.map((t) => runTrigger(t.id, { manual: false, force: false, startedBy: "cron" }))
    );

    const summary = results.map((r, i) => ({
      trigger: automatic[i].name,
      status: r.status === "fulfilled" ? r.value.status : "rejected",
      error: r.status === "rejected" ? String(r.reason) : r.value.error,
      matched: r.status === "fulfilled" ? r.value.matched : 0,
      sent: r.status === "fulfilled" ? r.value.sent : 0,
      failed: r.status === "fulfilled" ? r.value.failed : 0,
    }));

    return NextResponse.json({ ok: true, ran: summary.length, results: summary });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message || String(error) }, { status: 500 });
  }
}
