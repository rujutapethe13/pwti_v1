import "server-only";

export type EmailProviderName = "resend" | "gmail";

export interface GmailSendInput {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string | string[];
  idempotencyKey?: string;
}

export interface EmailResult {
  success: boolean;
  id?: string;
  error?: string;
  provider?: EmailProviderName;
  statusCode?: number;
}

export interface StoredTokens {
  id: number;
  provider: string;
  encrypted_refresh_token: string;
  access_token?: string | null;
  access_token_expires_at?: string | null;
  refresh_locked_at?: string | null;
  provider_unhealthy?: boolean | null;
  unhealthy_at?: string | null;
  unhealthy_reason?: string | null;
  updated_at?: string;
}
