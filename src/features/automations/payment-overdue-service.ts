import type {
  PaymentTerms,
  PaymentJobItem,
  WorkspaceAdminUser,
} from "./types";

/**
 * Calculates payment due date from job booked date and payment terms.
 * Immediate = booked date
 * 15 days = booked date + 15
 * 30 days = booked date + 30
 * 45 days = booked date + 45
 * Custom = booked date + customDays
 */
export function calculateDueDate(
  bookedDateStr: string,
  terms: PaymentTerms,
  customDays?: number
): string {
  if (!bookedDateStr) return "";
  const date = new Date(bookedDateStr);
  if (isNaN(date.getTime())) return bookedDateStr;

  let daysToAdd = 0;
  switch (terms) {
    case "Immediate":
      daysToAdd = 0;
      break;
    case "15 days":
      daysToAdd = 15;
      break;
    case "30 days":
      daysToAdd = 30;
      break;
    case "45 days":
      daysToAdd = 45;
      break;
    case "Custom":
      daysToAdd = Math.max(0, customDays || 0);
      break;
    default:
      daysToAdd = 0;
  }

  const result = new Date(date);
  result.setDate(result.getDate() + daysToAdd);
  return result.toISOString().split("T")[0];
}

/**
 * Evaluates whether a job is currently overdue based on today's date,
 * payment due date, payment status, and optional grace period.
 */
export function evaluateJobOverdue(
  job: PaymentJobItem,
  options?: {
    gracePeriodDays?: number;
    referenceDate?: Date;
  }
): {
  isOverdue: boolean;
  daysOverdue: number;
  reason: string;
} {
  if (job.paymentStatus === "Paid") {
    return {
      isOverdue: false,
      daysOverdue: 0,
      reason: "Payment already settled in full (Paid)",
    };
  }

  if (!job.paymentDueDate) {
    return {
      isOverdue: false,
      daysOverdue: 0,
      reason: "No payment due date recorded",
    };
  }

  const reference = options?.referenceDate ?? new Date();
  const dueDate = new Date(job.paymentDueDate);
  if (isNaN(dueDate.getTime())) {
    return {
      isOverdue: false,
      daysOverdue: 0,
      reason: "Invalid payment due date format",
    };
  }

  // Apply grace period: effective due date = dueDate + gracePeriodDays
  const gracePeriodDays = options?.gracePeriodDays ?? 0;
  const effectiveDueDate = new Date(dueDate);
  effectiveDueDate.setDate(effectiveDueDate.getDate() + gracePeriodDays);

  // Normalize to start of day for comparison
  const refStart = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const dueStart = new Date(effectiveDueDate.getFullYear(), effectiveDueDate.getMonth(), effectiveDueDate.getDate());

  const diffMs = refStart.getTime() - dueStart.getTime();
  const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (daysOverdue > 0) {
    return {
      isOverdue: true,
      daysOverdue,
      reason: `Overdue by ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} past due date ${job.paymentDueDate}${
        gracePeriodDays > 0 ? ` (+${gracePeriodDays}d grace)` : ""
      }`,
    };
  }

  return {
    isOverdue: false,
    daysOverdue: 0,
    reason: `Payment not yet overdue (due ${job.paymentDueDate})`,
  };
}

/**
 * Default workspace admins (top 3 admins configurable in settings).
 */
export const DEFAULT_WORKSPACE_ADMINS: WorkspaceAdminUser[] = [
  {
    id: "adm-1",
    name: "Rujuta Pethe",
    role: "Studio Lead & Account Director",
    email: "rujutapethe@gmail.com",
    isPinned: true,
  },
  {
    id: "adm-2",
    name: "Photofactory Finance Lead",
    role: "VP of Operations & Finance",
    email: "finance@photofactory.com",
    isPinned: true,
  },
  {
    id: "adm-3",
    name: "Photofactory Studio Admin",
    role: "Head of Studio Operations",
    email: "admin@photofactory.com",
    isPinned: true,
  },
];

export interface ResolvedRecipients {
  recipients: Array<{
    name: string;
    email: string;
    roleLabel: string;
  }>;
  warnings: string[];
}

/**
 * Resolves and deduplicates recipients for payment overdue alerts:
 * 1. Top 3 workspace admins
 * 2. Board owner
 * 3. Item assignee
 *
 * If one person fills multiple roles, send only 1 email.
 * If any recipient is missing an email, logs a warning.
 */
export function resolveOverdueRecipients(
  job: PaymentJobItem,
  options?: {
    adminList?: WorkspaceAdminUser[];
    includeBoardOwner?: boolean;
    includeAssignee?: boolean;
  }
): ResolvedRecipients {
  const admins = options?.adminList ?? DEFAULT_WORKSPACE_ADMINS;
  const includeBoardOwner = options?.includeBoardOwner ?? true;
  const includeAssignee = options?.includeAssignee ?? true;

  const emailToRecipient = new Map<string, { name: string; email: string; roleLabel: string }>();
  const warnings: string[] = [];

  // 1. Admins
  admins.slice(0, 3).forEach((adm) => {
    if (!adm.email) {
      warnings.push(`Workspace Admin '${adm.name}' has no email address configured.`);
    } else {
      const lower = adm.email.toLowerCase().trim();
      if (!emailToRecipient.has(lower)) {
        emailToRecipient.set(lower, {
          name: adm.name,
          email: adm.email,
          roleLabel: `Workspace Admin (${adm.role})`,
        });
      }
    }
  });

  // 2. Board Owner
  if (includeBoardOwner && job.boardOwner) {
    if (!job.boardOwner.email) {
      warnings.push(`Board Owner '${job.boardOwner.name}' has no email address configured.`);
    } else {
      const lower = job.boardOwner.email.toLowerCase().trim();
      if (emailToRecipient.has(lower)) {
        const existing = emailToRecipient.get(lower)!;
        existing.roleLabel += ", Board Owner";
      } else {
        emailToRecipient.set(lower, {
          name: job.boardOwner.name,
          email: job.boardOwner.email,
          roleLabel: "Board Owner",
        });
      }
    }
  }

  // 3. Assignee
  if (includeAssignee && job.assignee) {
    if (!job.assignee.email) {
      warnings.push(`Job Assignee '${job.assignee.name}' has no email address configured.`);
    } else {
      const lower = job.assignee.email.toLowerCase().trim();
      if (emailToRecipient.has(lower)) {
        const existing = emailToRecipient.get(lower)!;
        existing.roleLabel += ", Job Assignee";
      } else {
        emailToRecipient.set(lower, {
          name: job.assignee.name,
          email: job.assignee.email,
          roleLabel: "Job Assignee",
        });
      }
    }
  }

  return {
    recipients: Array.from(emailToRecipient.values()),
    warnings,
  };
}

/**
 * Standard default templates
 */
export const DEFAULT_OVERDUE_EMAIL_SUBJECT =
  "Payment overdue: {client_name} - {job_title} ({days_overdue} days)";

export const DEFAULT_OVERDUE_EMAIL_BODY = `Hello {recipient_name},

This is an automated alert regarding an overdue production payment:

• Client: {client_name}
• Job: {job_title} ({board_name})
• Outstanding Amount: {amount}
• Agreed Terms: {payment_terms}
• Payment Due Date: {due_date}
• Days Overdue: {days_overdue} days
• Assigned Lead: {assignee}

Please review the invoice status and initiate follow-up with the client accounting contact.

Direct Link: {item_url}

Powerweave Studio OS Automations Center`;

/**
 * Replaces all merge fields in template strings with actual values from the job item.
 */
export function interpolateMergeFields(
  template: string,
  job: PaymentJobItem,
  recipientName = "Team Member",
  daysOverdue = 0
): string {
  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(job.amount);

  const replacements: Record<string, string> = {
    "{recipient_name}": recipientName,
    "{client_name}": job.clientName,
    "{job_title}": job.jobTitle,
    "{board_name}": job.boardName,
    "{amount}": formattedAmount,
    "{payment_terms}": job.paymentTerms,
    "{due_date}": job.paymentDueDate,
    "{days_overdue}": String(daysOverdue),
    "{assignee}": job.assignee.name,
    "{item_url}": `https://app.powerweave.studio/boards/${job.boardId}?item=${job.id}`,
  };

  let result = template;
  for (const [key, val] of Object.entries(replacements)) {
    result = result.replaceAll(key, val);
  }
  return result;
}
