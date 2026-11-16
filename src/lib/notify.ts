import { sendEmail as libSendEmail } from "@/lib/email";

export type SendEmailInput = {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html: string;
};

export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await libSendEmail({
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      html: input.html,
    });
    if (!result.success) {
      return { ok: false, error: result.error };
    }
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
