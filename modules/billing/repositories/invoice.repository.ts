// modules/billing/repositories/invoice.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { Invoice, InvoiceStatus } from '../types/billing.types';

export class InvoiceRepository extends BaseRepository<Invoice> {
  protected collectionName = 'tblinvoices';

  async findByOrganization(organizationId: string, tenantId: string): Promise<Invoice[]> {
    return this.findMany(
      { organizationId } as Filter<Invoice>,
      tenantId,
      { sortBy: 'createdAt', sortOrder: 'desc' }
    );
  }

  async findByMerchantReference(merchantReference: string): Promise<Invoice | null> {
    const collection = await this.getCollection();
    return collection.findOne({ merchantReference } as Filter<Invoice>);
  }

  async findPendingByOrganization(organizationId: string, tenantId: string): Promise<Invoice[]> {
    return this.findMany(
      { organizationId, status: 'pending' } as Filter<Invoice>,
      tenantId
    );
  }

  async updateStatus(
    invoiceId: string,
    tenantId: string,
    status: InvoiceStatus,
    fields?: Partial<Pick<Invoice, 'paynowReference' | 'paidAt' | 'failureReason'>>
  ): Promise<Invoice | null> {
    return this.update(invoiceId, { status, ...fields } as Partial<Invoice>, tenantId);
  }

  /**
   * Atomically transitions an invoice from 'pending' to a terminal status,
   * guarding against double-processing the same Paynow result-URL POST
   * (Paynow may retry delivery of the same status update, and the
   * webhook should be idempotent rather than re-applying side effects
   * like upgrading the organization's plan twice).
   */
  async markPaidIfPending(
    invoiceId: string,
    paynowReference: string
  ): Promise<Invoice | null> {
    const collection = await this.getCollection();
    const { ObjectId } = await import('mongodb');
    if (!ObjectId.isValid(invoiceId)) return null;

    const result = await collection.findOneAndUpdate(
      {
        _id: new ObjectId(invoiceId) as any,
        status: 'pending',
      } as Filter<Invoice>,
      {
        $set: {
          status: 'paid',
          paynowReference,
          paidAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    return (result as Invoice) || null;
  }

  async markFailedIfPending(invoiceId: string, reason: string): Promise<Invoice | null> {
    const collection = await this.getCollection();
    const { ObjectId } = await import('mongodb');
    if (!ObjectId.isValid(invoiceId)) return null;

    const result = await collection.findOneAndUpdate(
      {
        _id: new ObjectId(invoiceId) as any,
        status: 'pending',
      } as Filter<Invoice>,
      {
        $set: {
          status: 'failed',
          failureReason: reason,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    return (result as Invoice) || null;
  }

  async expireOldPendingInvoices(olderThanHours: number = 48): Promise<number> {
    const collection = await this.getCollection();
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - olderThanHours);

    const result = await collection.updateMany(
      { status: 'pending', createdAt: { $lt: cutoff } } as Filter<Invoice>,
      { $set: { status: 'expired', updatedAt: new Date() } }
    );

    return result.modifiedCount;
  }
}

export const invoiceRepository = new InvoiceRepository();