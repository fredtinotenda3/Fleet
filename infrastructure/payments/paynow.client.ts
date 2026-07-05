// infrastructure/payments/paynow.client.ts
import crypto from 'crypto';
import { Paynow } from 'paynow';

/**
 * Thin wrapper around the official `paynow` npm package
 * (https://www.npmjs.com/package/paynow), Zimbabwe's Paynow payment
 * gateway. Paynow has no concept of "subscriptions" or webhook event
 * types the way Stripe does â€” it is a single-payment gateway:
 *
 *   1. You create a Payment with a unique merchant reference and line
 *      items, then call send() (web checkout) or sendMobile() (Ecocash/
 *      OneMoney) to get a redirect/poll URL back.
 *   2. Paynow later POSTs a status update to YOUR result URL, OR you can
 *      poll the pollUrl yourself.
 *   3. Both the outbound init and inbound result message are protected
 *      by a SHA512 hash: concatenate all field values (raw, URL-decoded
 *      form, in order, excluding the "hash" field itself), append the
 *      integration key, SHA512, uppercase hex. The SDK validates this
 *      internally for poll responses, but verifying an INBOUND POST to
 *      our own result URL is something we must do ourselves â€” the SDK
 *      does not expose a server-side webhook verifier.
 *
 * Source: https://developers.paynow.co.zw/docs/paynow/validating_hash/
 *         https://developers.paynow.co.zw/docs/paynow/generating_hash/
 */

interface PaynowConfig {
  integrationId: string;
  integrationKey: string;
  resultUrl: string;
  returnUrl: string;
}

export interface PaynowLineItem {
  name: string;
  price: number;
}

export interface PaynowInitResult {
  success: boolean;
  redirectUrl?: string;
  pollUrl?: string;
  instructions?: string;
  paynowReference?: string;
  error?: string;
}

export interface PaynowStatusResult {
  paid: boolean;
  status: string;
  amount: number;
  reference: string;
  paynowReference: string;
  pollUrl: string;
}

export type PaynowMobileMethod = 'ecocash' | 'onemoney';

/**
 * Result-URL webhook payload as documented at
 * https://developers.paynow.co.zw/docs/paynow/status_update/
 * Field presence/order varies (tokenization fields are conditional), so
 * this is intentionally a loose record rather than a strict interface â€”
 * hash verification operates on whatever fields are actually present.
 */
export type PaynowResultPayload = Record<string, string> & {
  reference: string;
  paynowreference: string;
  amount: string;
  status: string;
  pollurl: string;
  hash: string;
};

export class PaynowClient {
  private sdk: any | null = null;
  private readonly config: PaynowConfig;

  constructor(config?: Partial<PaynowConfig>) {
    this.config = {
      integrationId: config?.integrationId || process.env.PAYNOW_INTEGRATION_ID || '',
      integrationKey: config?.integrationKey || process.env.PAYNOW_INTEGRATION_KEY || '',
      resultUrl: config?.resultUrl || `${process.env.NEXTAUTH_URL}/api/billing/webhook`,
      returnUrl: config?.returnUrl || `${process.env.NEXTAUTH_URL}/billing/return`,
    };

    if (!this.config.integrationId || !this.config.integrationKey) {
      console.warn(
        '[PaynowClient] PAYNOW_INTEGRATION_ID / PAYNOW_INTEGRATION_KEY are not configured. ' +
          'Billing operations will fail until these are set.'
      );
    }
  }

  /**
   * Lazily constructs the SDK instance so the module can be imported
   * (e.g. for hash verification in the webhook handler) even in
   * environments where the credentials aren't yet configured.
   */
 private getSdk(): any {
    if (!this.sdk) {
      this.sdk = new Paynow(this.config.integrationId, this.config.integrationKey);
      this.sdk.resultUrl = this.config.resultUrl;
      this.sdk.returnUrl = this.config.returnUrl;
    }
    return this.sdk;
}

  /**
   * Initiates a web-based checkout (redirect flow). `merchantReference`
   * must be unique per payment attempt â€” we use the Invoice's `_id`.
   */
  async createWebPayment(
    merchantReference: string,
    items: PaynowLineItem[],
    email?: string
  ): Promise<PaynowInitResult> {
    try {
      const paynow = this.getSdk();
      const payment = email
        ? paynow.createPayment(merchantReference, email)
        : paynow.createPayment(merchantReference);

      for (const item of items) {
        payment.add(item.name, item.price);
      }

      const response = await paynow.send(payment);

      if (!response.success) {
        return { success: false, error: response.error || 'Payment initiation failed' };
      }

      return {
        success: true,
        redirectUrl: response.redirectUrl,
        pollUrl: response.pollUrl,
        paynowReference: response.paynowReference,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Paynow error',
      };
    }
  }

  /**
   * Initiates an Ecocash/OneMoney mobile money payment. Requires the
   * payer's email (per SDK requirements for mobile-based transactions).
   */
  async createMobilePayment(
    merchantReference: string,
    items: PaynowLineItem[],
    email: string,
    phoneNumber: string,
    method: PaynowMobileMethod
  ): Promise<PaynowInitResult> {
    try {
      const paynow = this.getSdk();
      const payment = paynow.createPayment(merchantReference, email);

      for (const item of items) {
        payment.add(item.name, item.price);
      }

      const response = await paynow.sendMobile(payment, phoneNumber, method);

      if (!response.success) {
        return { success: false, error: response.error || 'Mobile payment initiation failed' };
      }

      return {
        success: true,
        pollUrl: response.pollUrl,
        instructions: response.instructions,
        paynowReference: response.paynowReference,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Paynow error',
      };
    }
  }

  async pollStatus(pollUrl: string): Promise<PaynowStatusResult> {
    const paynow = this.getSdk();
    const status = await paynow.pollTransaction(pollUrl);

    return {
      paid: typeof status.paid === 'function' ? status.paid() : Boolean(status.paid),
      status: status.status,
      amount: parseFloat(status.amount),
      reference: status.reference,
      paynowReference: status.paynowReference,
      pollUrl,
    };
  }

  /**
   * Verifies the SHA512 hash on an inbound result-URL POST.
   *
   * Algorithm (per Paynow's "Validating a hash on an inbound message"
   * docs): concatenate every field's value EXCEPT "hash", in the order
   * the fields appear in the payload, using each value's raw/decoded
   * form, then append the integration key, SHA512, uppercase hex, and
   * compare to the provided hash value (case-insensitive-safe compare).
   *
   * This must run before trusting ANY field in the payload â€” a forged
   * POST to our result URL with a fabricated "Paid" status would
   * otherwise let an attacker mark any invoice as paid for free.
   */
  verifyResultHash(payload: PaynowResultPayload): boolean {
    if (!payload.hash) return false;

    let concatenated = '';
    for (const [key, value] of Object.entries(payload)) {
      if (key.toLowerCase() === 'hash') continue;
      concatenated += value ?? '';
    }
    concatenated += this.config.integrationKey;

    const computedHash = crypto
      .createHash('sha512')
      .update(concatenated, 'utf8')
      .digest('hex')
      .toUpperCase();

    return this.timingSafeEqual(computedHash, payload.hash.toUpperCase());
  }

  /**
   * Constant-time string comparison to avoid leaking timing information
   * about how many leading characters matched, which is the standard
   * concern with using `===` to compare secrets/signatures.
   */
  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
    } catch {
      return false;
    }
  }
}

export const paynowClient = new PaynowClient();