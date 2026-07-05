//types/paynow.d.ts

declare module "paynow" {
  export class Payment {
    add(title: string, amount: number): void;
  }

  export interface InitResponse {
    success: boolean;
    redirectUrl: string;
    pollUrl: string;
    paynowReference: string;
    instructions?: string;
    error?: string;
  }

  export interface StatusResponse {
    status: string;
    amount: string;
    reference: string;
    paynowReference: string;
    paid(): boolean;
  }

  export class Paynow {
    constructor(integrationId: string, integrationKey: string);

    resultUrl: string;
    returnUrl: string;

    createPayment(reference: string): Payment;
    createPayment(reference: string, email: string): Payment;

    send(payment: Payment): Promise<InitResponse>;

    sendMobile(
      payment: Payment,
      phone: string,
      method: "ecocash" | "onemoney"
    ): Promise<InitResponse>;

    pollTransaction(url: string): Promise<StatusResponse>;
  }
}