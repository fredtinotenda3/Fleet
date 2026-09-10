// modules/billing/events/InvoicePaidEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { INVOICE_PAID } from '@/server/events/event-names';
import { Invoice } from '../types/billing.types';

export class InvoicePaidEvent extends DomainEvent {
  /**
   * @param ownerId The organization owner, who is who gets told the
   *   invoice was paid.
   *
   *   ADDED because NotificationHandler.onInvoicePaid reads
   *   `payload.ownerId` and this event has never set it -- so the guard
   *   `if (ownerId)` was always false and the "Invoice Paid"
   *   notification has never been sent to anyone. The sibling
   *   `onMemberJoined` works, because MemberJoinedEvent does carry
   *   `ownerId`, which is what made the missing one look like a user's
   *   notification preference rather than a defect.
   *
   *   Passed explicitly rather than read from `metadata.userId`: the
   *   caller happens to put the owner there today, but metadata is the
   *   ACTING user by contract, and a future call from an admin tool
   *   would then notify the admin instead of the customer.
   */
  constructor(invoice: Invoice, ownerId: string | undefined, metadata?: Record<string, unknown>) {
    super(INVOICE_PAID, {
      ownerId,
      entityId: invoice._id,
      entityType: 'invoice',
      organizationId: invoice.organizationId,
      planId: invoice.planId,
      amount: invoice.amount,
      paidAt: invoice.paidAt,
      tenantId: invoice.tenantId,
    }, metadata);
  }
}