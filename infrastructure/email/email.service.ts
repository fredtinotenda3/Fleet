// infrastructure/email/email.service.ts

/**
 * Minimal SMTP abstraction. Lazily imports nodemailer only when
 * SMTP_HOST is configured, matching the codebase's existing pattern for
 * optional infrastructure (Redis, Sentry, S3). In environments without
 * SMTP configured, send() logs and no-ops rather than throwing, so
 * local/dev environments don't need a mail server to boot workers.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

let transporterPromise: Promise<any> | null = null;

async function getTransporter(): Promise<any | null> {
  if (!process.env.SMTP_HOST) return null;
  if (!transporterPromise) {
    transporterPromise = (async () => {
      const nodemailer = await import('nodemailer');
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
    })();
  }
  return transporterPromise;
}

export class EmailService {
  async send(message: EmailMessage): Promise<{ sent: boolean }> {
    const transporter = await getTransporter();
    if (!transporter) {
      console.warn('[EmailService] SMTP_HOST not configured â€” email not sent:', message.subject, '->', message.to);
      return { sent: false };
    }

    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'no-reply@fleet-platform.local',
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    return { sent: true };
  }
}

export const emailService = new EmailService();