// workers/sms.worker.ts

import { BaseWorker } from '@/infrastructure/queue/worker-base.service';
import { smsService } from '@/infrastructure/sms/sms.service';

interface SendSmsPayload {
  to: string;
  body: string;
}

export class SmsWorker extends BaseWorker<SendSmsPayload> {
  constructor() {
    super('send-sms');
  }

  protected async process(_jobName: string, payload: SendSmsPayload): Promise<void> {
    await smsService.send({ to: payload.to, body: payload.body });
  }
}