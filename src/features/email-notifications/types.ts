/**
 * Email Notification Automation types
 */

export interface EmailNotificationAutomation {
  id: string;
  boardId: string;
  workspaceId?: string;
  organizationId?: string;
  triggerType: "job_status_pending";
  receiverEmails: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface EmailNotificationLog {
  id: string;
  automationId: string;
  boardId: string;
  jobId: string;
  receiverEmail: string;
  status: "pending" | "sent" | "failed";
  sentAt?: string;
  error?: string;
  retryCount: number;
  createdAt: string;
}

export interface EmailNotificationPayload {
  workspaceName: string;
  boardName: string;
  jobName: string;
  status: "Pending";
  link: string;
  time: string;
}

export type EmailProviderType = "gmail" | "outlook";

export interface EmailProvider {
  sendMail(to: string | string[], subject: string, html: string, text?: string): Promise<{ success: boolean; id?: string; error?: string }>;
}
