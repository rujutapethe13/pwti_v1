"use server";

import { Resend } from "resend";

/**
 * Server-only email helper powered by Resend.
 * Never throws into the caller: catches and logs errors so a failed email
 * can never break a save, a trigger run, or any user action.
 */
export async function sendEmail(params: {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || apiKey === "replace_me_with_resend_api_key") {
      throw new Error("RESEND_API_KEY not configured");
    }

    const resend = new Resend(apiKey);
    const from = process.env.NOTIFY_EMAIL || "onboarding@resend.dev";

    const result = await resend.emails.send({
      from,
      to: Array.isArray(params.to) ? params.to : [params.to],
      cc: params.cc ? (Array.isArray(params.cc) ? params.cc : [params.cc]) : undefined,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });

    if (result.error) {
      console.error("[notify] Resend error:", result.error);
      return { ok: false, error: String(result.error.message || result.error) };
    }

    return { ok: true, id: (result.data as { id?: string })?.id };
  } catch (error: any) {
    console.error("[notify] sendEmail failed:", error.message || error);
    return { ok: false, error: error.message || String(error) };
  }
}
