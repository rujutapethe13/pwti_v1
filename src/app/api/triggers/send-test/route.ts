import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/notify";

/**
 * Sends a sample trigger email to the configured NOTIFY_EMAIL ("me").
 * Server-only: RESEND_API_KEY is never exposed to the client.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const to = body.to || process.env.NOTIFY_EMAIL;
    if (!to) {
      return NextResponse.json({ error: "NOTIFY_EMAIL not configured" }, { status: 400 });
    }

    const subject = body.subject || "Powerweave Studio OS — Trigger test email";
    const html = body.html || `
      <h2>Trigger test email</h2>
      <p>This is a sample email from your custom trigger system.</p>
      <p>If you received it, email sending is working.</p>
    `;

    const result = await sendEmail({ to: [String(to)], subject, html, text: "Trigger test email from Powerweave Studio OS" });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ ok: true, id: result.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
