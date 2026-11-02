
import { createServiceClient } from '@/lib/supabase/server';
import { EmailNotificationAutomation } from './types';

const TABLE_AUTOMATIONS = 'email_notification_automations';
const TABLE_LOGS = 'email_notification_logs';

/**
 * Validates an email address.
 */
function isValidEmail(email: string): boolean {
  const normalizedEmail = email.trim();
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  return re.test(normalizedEmail);
}

/**
 * Validates a list of receiver emails.
 */
export function validateReceivers(
  emails: string[]
): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const email of emails) {
    const normalizedEmail = email.trim().toLowerCase();

    if (isValidEmail(normalizedEmail)) {
      valid.push(normalizedEmail);
    } else {
      invalid.push(email);
    }
  }

  return { valid, invalid };
}

/**
 * Creates a new email notification automation.
 */
export async function createAutomation(params: {
  boardId: string;
  workspaceId?: string;
  organizationId?: string;
  receiverEmails: string[];
  enabled?: boolean;
  createdBy?: string;
}) {
  const { valid, invalid } = validateReceivers(params.receiverEmails);

  if (invalid.length > 0) {
    throw new Error(`Invalid email(s): ${invalid.join(', ')}`);
  }

  if (valid.length === 0) {
    throw new Error('At least one valid receiver email required');
  }

  const supabase = await createServiceClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from(TABLE_AUTOMATIONS)
    .insert({
      board_id: params.boardId,
      workspace_id: params.workspaceId,
      organization_id: params.organizationId,
      trigger_type: 'job_status_pending',
      receiver_emails: valid,
      enabled: params.enabled ?? true,
      created_by: params.createdBy,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Updates an existing email notification automation.
 */
export async function updateAutomation(
  id: string,
  updates: Partial<EmailNotificationAutomation>
) {
  const supabase = await createServiceClient();

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.receiverEmails) {
    const { valid, invalid } = validateReceivers(updates.receiverEmails);

    if (invalid.length > 0) {
      throw new Error(`Invalid email(s): ${invalid.join(', ')}`);
    }

    if (valid.length === 0) {
      throw new Error('At least one valid receiver email required');
    }

    payload.receiver_emails = valid;
  }

  if (typeof updates.enabled === 'boolean') {
    payload.enabled = updates.enabled;
  }

  const { data, error } = await supabase
    .from(TABLE_AUTOMATIONS)
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Enables or disables an automation.
 */
export async function toggleAutomation(
  id: string,
  enabled: boolean
) {
  return updateAutomation(id, { enabled });
}

/**
 * Lists email notification automations.
 */
export async function listAutomations(boardId?: string) {
  const supabase = await createServiceClient();

  let query = supabase
    .from(TABLE_AUTOMATIONS)
    .select('*');

  if (boardId) {
    query = query.eq('board_id', boardId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Checks whether a notification has already been sent.
 */
export async function hasAlreadySent(
  automationId: string,
  jobId: string,
  receiverEmail: string
): Promise<boolean> {
  const supabase = await createServiceClient();

  const { data, error } = await supabase
    .from(TABLE_LOGS)
    .select('id')
    .eq('automation_id', automationId)
    .eq('job_id', jobId)
    .eq('receiver_email', receiverEmail.toLowerCase().trim())
    .eq('status', 'sent')
    .maybeSingle();

  if (error) {
    return false;
  }

  return !!data;
}

/**
 * Creates a notification log entry.
 */
export async function logNotification(params: {
  automationId: string;
  boardId: string;
  jobId: string;
  receiverEmail: string;
  status: 'pending' | 'sent' | 'failed';
  error?: string;
  retryCount?: number;
}) {
  const supabase = await createServiceClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from(TABLE_LOGS)
    .insert({
      automation_id: params.automationId,
      board_id: params.boardId,
      job_id: params.jobId,
      receiver_email: params.receiverEmail.toLowerCase().trim(),
      status: params.status,
      sent_at: params.status === 'sent' ? now : null,
      error: params.error || null,
      retry_count: params.retryCount || 0,
      created_at: now,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Updates an existing notification log.
 */
export async function updateNotificationLog(
  id: string,
  updates: {
    status?: string;
    error?: string;
    retryCount?: number;
    sentAt?: string;
  }
) {
  const supabase = await createServiceClient();

  const payload: Record<string, unknown> = {};

  if (updates.status) {
    payload.status = updates.status;
  }

  if (updates.error) {
    payload.error = updates.error;
  }

  if (typeof updates.retryCount === 'number') {
    payload.retry_count = updates.retryCount;
  }

  if (updates.sentAt) {
    payload.sent_at = updates.sentAt;
  }

  const { data, error } = await supabase
    .from(TABLE_LOGS)
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
