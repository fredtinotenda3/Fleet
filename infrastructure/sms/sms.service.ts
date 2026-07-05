// infrastructure/sms/sms.service.ts

/**
 * Minimal SMS gateway abstraction (Twilio-shaped). Lazily imports the
 * Twilio SDK only when credentials are present, same pattern as
 * EmailService. Swap the provider by replacing the body of `send()`.
 */

export interface SmsMessage {
  to: string; // E.164
  body: string;
}

let clientPromise: Promise<any> | null = null;

async function getClient(): Promise<any | null> {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      const { default: Twilio } = await import('twilio');
      return Twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
    })();
  }
  return clientPromise;
}

export class SmsService {
  async send(message: SmsMessage): Promise<{ sent: boolean }> {
    const client = await getClient();
    if (!client) {
      console.warn('[SmsService] TWILIO credentials not configured â€” SMS not sent to', message.to);
      return { sent: false };
    }

    await client.messages.create({
      from: process.env.TWILIO_FROM_NUMBER,
      to: message.to,
      body: message.body,
    });

    return { sent: true };
  }
}

export const smsService = new SmsService();