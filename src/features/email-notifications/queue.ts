import { emailService } from './email-service';
import { hasAlreadySent, logNotification, updateNotificationLog } from './storage';
import { EmailNotificationAutomation } from './types';

interface QueueItem {
  automation: EmailNotificationAutomation;
  boardId: string;
  jobId: string;
  jobName: string;
  boardName: string;
  workspaceName: string;
  link: string;
  time: string;
  receivers: string[];
}

export class EmailQueue {
  private queue: QueueItem[] = [];
  private processing = false;
  private maxRetries = 3;
  private baseDelay = 500; // ms

  enqueue(item: QueueItem) {
    this.queue.push(item);
    if (!this.processing) {
      this.process();
    }
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        await this.processItem(item);
      } catch (error) {
        console.error('[email-notifications] Queue error:', error);
      }
    }

    this.processing = false;
  }

  private async processItem(item: QueueItem, retryCount = 0) {
    const receivers = item.receivers.filter(r => r && r.includes('@'));
    for (const receiver of receivers) {
      // Idempotency: one email per job per receiver
      const alreadySent = await hasAlreadySent((item.automation as any).id || item.automation.boardId + ':' + item.jobId, item.jobId, receiver);
      if (alreadySent) {
        continue;
      }

      const log = await logNotification({
        automationId: (item.automation as any).id,
        boardId: item.boardId,
        jobId: item.jobId,
        receiverEmail: receiver,
        status: 'pending',
        retryCount,
      });

      try {
        const result = await emailService.sendPendingNotification([receiver], {
          workspaceName: item.workspaceName,
          boardName: item.boardName,
          jobName: item.jobName,
          status: 'Pending',
          link: item.link,
          time: item.time,
        });

        if (result.success) {
          await updateNotificationLog(log.id, { status: 'sent', sentAt: new Date().toISOString(), retryCount });
        } else {
          throw new Error(result.error || 'Send failed');
        }
      } catch (error: any) {
        if (retryCount < this.maxRetries) {
          const delay = this.baseDelay * Math.pow(2, retryCount);
          setTimeout(() => {
            this.processItem(item, retryCount + 1);
          }, delay);
        } else {
          await updateNotificationLog(log.id, { status: 'failed', error: error.message, retryCount });
          console.error('[email-notifications] Failed after retries:', error.message);
        }
      }
    }
  }
}

export const emailQueue = new EmailQueue();
