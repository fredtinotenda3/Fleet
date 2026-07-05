// modules/webhooks/services/webhook-signing.service.ts

import crypto from 'crypto';

/**
 * HMAC-SHA256 request signing for outbound webhook deliveries. Mirrors
 * the verification-not-generation half of what PaynowClient does for
 * inbound webhooks (infrastructure/payments/paynow.client.ts) — here the
 * platform is the sender, so it only ever needs to sign, never verify.
 * Receivers reconstruct the same HMAC over the raw body using the shared
 * secret to authenticate the request came from us and wasn't tampered
 * with in transit.
 */
export class WebhookSigningService {
  sign(rawBody: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  }

  generateSecret(): string {
    return `whsec_${crypto.randomBytes(24).toString('base64url')}`;
  }

  buildSignatureHeader(rawBody: string, secret: string): string {
    return `sha256=${this.sign(rawBody, secret)}`;
  }
}

export const webhookSigningService = new WebhookSigningService();