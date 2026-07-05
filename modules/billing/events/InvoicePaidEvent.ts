// modules/billing/events/InvoicePaidEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { INVOICE_PAID } from '@/server/events/event-names';
import { Invoice } from '../types/billing.types';

export class InvoicePaidEvent extends DomainEvent {
  constructor(invoice: Invoice, metadata?: Record<string, unknown>) {
    super(INVOICE_PAID, {
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