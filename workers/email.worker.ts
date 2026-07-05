// workers/email.worker.ts

import { BaseWorker } from '@/infrastructure/queue/worker-base.service';
import { emailService } from '@/infrastructure/email/email.service';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { ObjectId } from 'mongodb';

interface SendEmailPayload {
  userId?: string;
  email?: string;
  subject: string;
  text?: string;
  html?: string;
}

export class EmailWorker extends BaseWorker<SendEmailPayload> {
  constructor() {
    super('send-email');
  }

  protected async process(_jobName: string, payload: SendEmailPayload): Promise<void> {
    let to = payload.email;

    if (!to && payload.userId && ObjectId.isValid(payload.userId)) {
      const db = await connectToDatabase();
      const admin = await db.collection('tbladmin').findOne({ _id: new ObjectId(payload.userId) });
      to = admin?.Email;
    }

    if (!to) {
      console.warn('[EmailWorker] No resolvable recipient for job; skipping');
      return;
    }

    await emailService.send({ to, subject: payload.subject, text: payload.text, html: payload.html });
  }
}