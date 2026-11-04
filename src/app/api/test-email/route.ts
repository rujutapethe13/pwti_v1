import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/notify";

export async function GET(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const to = process.env.NOTIFY_EMAIL;
  if (!to) return NextResponse.json({ error: "NOTIFY_EMAIL missing" }, { status: 400 });
  const r = await sendEmail({ to, subject: "Test email", html: "<p>Test</p>" });
  return NextResponse.json(r);
}