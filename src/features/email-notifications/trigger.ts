
import { emailQueue } from './queue';
import { EmailNotificationAutomation } from './types';

export interface JobStatusChangeEvent {
  boardId: string;
  workspaceId?: string;
  workspaceName: string;
  boardName: string;
  jobId: string; // record id
  jobName: string;
  oldStatus?: string;
  newStatus: string;
  link?: string;
  time?: string;
}

/**
 * Trigger handler: fire from existing "job status changed" event.
 * When job/status becomes "pending" (case-insensitive),
 * send emails to configured receivers.
 */
export async function handleJobStatusChanged(
  event: JobStatusChangeEvent,
  automations: EmailNotificationAutomation[]
) {
  try {
    const newStatus = (event.newStatus || '').toLowerCase().trim();

    // Only trigger when status becomes pending.
    if (newStatus !== 'pending') {
      return;
    }

    for (const automation of automations) {
      // Skip disabled automations.
      if (!automation.enabled) continue;

      // Only process automations belonging to this board.
      const automationBoardId =
        automation.boardId || (automation as any).board_id;

      if (automationBoardId !== event.boardId) {
        continue;
      }

      // Support both camelCase and snake_case database fields.
      const receivers =
        automation.receiverEmails ||
        (automation as any).receiver_emails ||
        [];

      if (!Array.isArray(receivers) || receivers.length === 0) {
        continue;
      }

      // Only allow valid email addresses from configured receivers.
      const allowedReceivers = receivers.filter(
        (receiver: string) =>
          typeof receiver === 'string' &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receiver.trim())
      );

      if (allowedReceivers.length === 0) {
        continue;
      }

      // Generate the record URL.
      const appUrl = (
        process.env.NEXT_PUBLIC_APP_URL || ''
      ).replace(/\/+$/, '');

      const recordLink =
        event.link ||
        `${appUrl}/boards/?record=${encodeURIComponent(event.jobId)}`;

      // Queue the email notification.
      emailQueue.enqueue({
        automation: automation as any,
        boardId: event.boardId,
        jobId: event.jobId,
        jobName: event.jobName,
        boardName: event.boardName,
        workspaceName: event.workspaceName,
        link: recordLink,
        time: event.time || new Date().toISOString(),
        receivers: allowedReceivers,
      });
    }
  } catch (error) {
    console.error(
      '[email-notifications] Trigger handler error:',
      error
    );

    // Never crash the main app.
  }
}

/**
 * DB change hook style - can be called from webhooks/Supabase functions.
 */
export async function onJobStatusChangedFromDb(payload: any) {
  try {
    // Expect payload with job/record info.
    const event: JobStatusChangeEvent = {
      boardId: payload.board_id || payload.boardId,
      workspaceId: payload.workspace_id || payload.workspaceId,
      workspaceName:
        payload.workspace_name || payload.workspaceName || '',
      boardName: payload.board_name || payload.boardName || '',
      jobId:
        payload.record_id ||
        payload.jobId ||
        payload.id,
      jobName:
        payload.title ||
        payload.jobName ||
        payload.name ||
        '',
      oldStatus:
        payload.old_status ||
        payload.oldStatus,
      newStatus:
        payload.new_status ||
        payload.newStatus ||
        payload.status,
      link: payload.link,
      time:
        payload.updated_at ||
        payload.time ||
        new Date().toISOString(),
    };

    // Automations are loaded by the caller.
    // This hook returns the normalized event.
    return event;
  } catch (error) {
    console.error(
      '[email-notifications] DB hook error:',
      error
    );

    return null;
  }
}
