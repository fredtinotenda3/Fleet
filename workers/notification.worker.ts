// workers/notification.worker.ts

import { BaseWorker } from '@/infrastructure/queue/worker-base.service';
import { notificationService } from '@/modules/notifications/services/notification.service';
import { queueService, JobType } from '@/infrastructure/queue/queue.service';

interface SendNotificationPayload {
  userId: string;
  notification: Record<string, unknown>;
}

/**
 * Consumes SEND_NOTIFICATION jobs. notificationService.sendNotification
 * already handles preference filtering, in-app WebSocket emission, and
 * persistence â€” this worker's only added value is: (1) taking that work
 * off the request path (callers now enqueue instead of awaiting), and
 * (2) fanning email/sms delivery methods out to their own dedicated
 * queues so a slow SMTP provider never blocks in-app notification
 * delivery for other users.
 */
export class NotificationWorker extends BaseWorker<SendNotificationPayload> {
  constructor() {
    super('send-notification');
  }

  protected async process(_jobName: string, payload: SendNotificationPayload, tenantId: string): Promise<void> {
    const { userId, notification } = payload;
    const sent = await notificationService.sendNotification(userId, tenantId, notification as any);
    if (!sent) return;

    if (sent.deliveryMethods.includes('email')) {
      await queueService.addJob(JobType.SEND_EMAIL, {
        type: JobType.SEND_EMAIL,
        tenantId,
        payload: { userId, subject: sent.title, text: sent.message },
      });
    }
    // SMS delivery is opt-in per notification type via preferences;
    // wired the same way once a phone-number-on-file field exists.
  }
}