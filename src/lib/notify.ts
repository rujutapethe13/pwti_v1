import { Resend } from "resend";
import { getEmailProvider } from "@/features/email-notifications/providers";

export type SendEmailInput = {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html: string;
};

export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; error?: string }> {
  const provider = (process.env.EMAIL_PROVIDER || "gmail").toLowerCase();
  try {
    if (provider === "resend") {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) return { ok: false, error: "RESEND_API_KEY missing" };
      const resend = new Resend(apiKey);
      await resend.emails.send({
        from: process.env.NOTIFY_EMAIL ?? "noreply@example.com",
        to: input.to,
        cc: input.cc,
        subject: input.subject,
        html: input.html,
      });
      return { ok: true };
    }
    const p = getEmailProvider(provider);
    const r = await p.sendMail(input.to, input.subject, input.html);
    if (!r.success) return { ok: false, error: r.error };
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[notify] send failed:", msg);
    return { ok: false, error: msg };
  }
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}