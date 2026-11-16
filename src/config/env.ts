/**
 * Environment Variable Validation
 *
 * Uses Zod to validate environment variables at runtime.
 * Uses `.safeParse()` so the build doesn't fail when env vars are
 * unavailable. The app will still throw clearly on first access
 * if a required var is missing.
 *
 * ── Usage ──────────────────────────────────────────────────
 *   Client-side:
 *     import { clientEnv } from "@/config/env";
 *     console.log(clientEnv.NEXT_PUBLIC_SUPABASE_URL);
 *
 *   Server-side:
 *     import { serverEnv } from "@/config/env";
 *     console.log(serverEnv.SUPABASE_SERVICE_ROLE_KEY);
 * ────────────────────────────────────────────────────────────
 */

import { z } from "zod";

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url("NEXT_PUBLIC_APP_URL must be a valid URL"),
  NEXT_PUBLIC_RESET_ON_LOAD: z
    .enum(["true", "false"])
    .optional()
    .default("false"),
});

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required for access-request email notifications"),
  // Email provider: "resend" (default) or "gmail".
  EMAIL_PROVIDER: z.enum(["resend", "gmail"]).default("resend").optional(),
  // Per-event provider override, e.g. EMAIL_PROVIDER_AUTH=resend keeps
  // password-reset/changed emails on Resend while other events use Gmail.
  EMAIL_PROVIDER_AUTH: z.enum(["resend", "gmail"]).optional(),
  // Gmail API (personal Gmail) — optional; only required when EMAIL_PROVIDER=gmail.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GMAIL_SENDER: z.string().optional(),
  // 32-byte base64 AES-256-GCM key for encrypting the stored refresh token.
  EMAIL_ENCRYPTION_KEY: z.string().optional(),
  ADMIN_SETUP_SECRET: z.string().optional(),
});

function createEnvProxy<T extends object>(
  parsed: z.SafeParseReturnType<Record<string, unknown>, T>,
  schema: z.ZodType<T>,
) {
  return parsed.success
    ? parsed.data
    : new Proxy(
        {} as unknown as T,
        {
          get() {
            throw new Error(
              `❌ Environment variable validation failed:\n${parsed.error?.errors
                .map((e) => `   - ${e.path.join(".")}: ${e.message}`)
                .join("\n")}\n\n` +
                `See .env.local.example for required variables.`,
            );
          },
        },
      );
}

const clientEnvRaw = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_RESET_ON_LOAD: process.env.NEXT_PUBLIC_RESET_ON_LOAD,
};

const serverEnvRaw = {
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
  EMAIL_PROVIDER_AUTH: process.env.EMAIL_PROVIDER_AUTH,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GMAIL_SENDER: process.env.GMAIL_SENDER,
  EMAIL_ENCRYPTION_KEY: process.env.EMAIL_ENCRYPTION_KEY,
  ADMIN_SETUP_SECRET: process.env.ADMIN_SETUP_SECRET,
};

const clientParsed = clientEnvSchema.safeParse(clientEnvRaw);
export const clientEnv = createEnvProxy(clientParsed, clientEnvSchema);

const serverParsed = serverEnvSchema.safeParse(serverEnvRaw);
export const serverEnv = createEnvProxy(serverParsed, serverEnvSchema);

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
