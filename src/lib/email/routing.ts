import "server-only";

/**
 * Recipient routing layer.
 *
 * Decides the To / CC / BCC recipients per email event. Configured by env
 * (never hardcoded in the sender). The sender itself only transports what
 * routing resolves.
 *
 * Env vars used:
 *   OWNER_EMAIL      — workspace owner / company notification recipient
 *   NOTIFY_EMAIL     — company notification / test recipient
 */

export type EmailEvent =
  | "access-request"
  | "access-approved"
  | "access-declined"
  | "password-reset"
  | "password-changed"
  | "company-notification"
  | "job-pending"
  | "trigger-test";

export interface RoutingResult {
  to: string[];
  cc?: string[];
  bcc?: string[];
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[email/routing] ${name} environment variable is not set`);
  }
  return value;
}

function ownerEmail(): string {
  return required("OWNER_EMAIL");
}

function notifyEmail(): string {
  return required("NOTIFY_EMAIL");
}

/**
 * Resolve recipients for an event. `ctx` supplies event-specific addresses
 * (e.g. the requester's email, the user resetting their password).
 */
export function resolveRecipients(
  event: EmailEvent,
  ctx?: {
    requesterEmail?: string;
    userEmail?: string;
    receivers?: string[];
    customTo?: string[];
    customCc?: string[];
  },
): RoutingResult {
  switch (event) {
    case "access-request":
      return { to: [ownerEmail()] };
    case "access-approved":
    case "access-declined":
      if (!ctx?.requesterEmail) {
        throw new Error(
          `[email/routing] ${event} requires ctx.requesterEmail`,
        );
      }
      return { to: [ctx.requesterEmail] };
    case "password-reset":
    case "password-changed":
      if (!ctx?.userEmail) {
        throw new Error(`[email/routing] ${event} requires ctx.userEmail`);
      }
      return { to: [ctx.userEmail] };
    case "company-notification":
      return { to: [notifyEmail()] };
    case "trigger-test":
      return { to: [notifyEmail()] };
    case "job-pending": {
      const receivers = ctx?.receivers ?? [];
      if (receivers.length === 0) {
        throw new Error("[email/routing] job-pending requires ctx.receivers");
      }
      return { to: receivers };
    }
    default:
      return { to: ctx?.customTo ?? [notifyEmail()] };
  }
}
