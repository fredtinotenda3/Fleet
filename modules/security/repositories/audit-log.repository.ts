// modules/security/repositories/audit-log.repository.ts

import connectToDatabase from '@/infrastructure/database/mongodb';
import { AuditLogEntry, AuditLogFilters } from '../types/audit-log.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

const COLLECTION = 'tblauditlog';

/**
 * Append-only repository for the hash-chained audit ledger. Deliberately
 * does NOT extend BaseRepository: every method BaseRepository exposes for
 * update/soft-delete/hard-delete would violate the append-only guarantee
 * this collection exists to provide. `append` is the only mutation this
 * repository permits, and it always inserts a brand new document.
 */
export class AuditLogRepository {
  private async getCollection() {
    const db = await connectToDatabase();
    return db.collection<AuditLogEntry>(COLLECTION);
  }

  async getLastEntry(): Promise<AuditLogEntry | null> {
    const collection = await this.getCollection();
    const results = await collection.find({}).sort({ sequence: -1 }).limit(1).toArray();
    return results[0] ?? null;
  }

  async getBySequence(sequence: number): Promise<AuditLogEntry | null> {
    const collection = await this.getCollection();
    return collection.findOne({ sequence });
  }

  async append(entry: Omit<AuditLogEntry, '_id' | 'createdAt'>): Promise<AuditLogEntry> {
    const collection = await this.getCollection();
    const document = { ...entry, createdAt: new Date() };
    const result = await collection.insertOne(document as any);
    return { ...document, _id: result.insertedId.toString() };
  }

  async getAllFromSequence(fromSequence: number): Promise<AuditLogEntry[]> {
    const collection = await this.getCollection();
    return collection.find({ sequence: { $gte: fromSequence } }).sort({ sequence: 1 }).toArray();
  }

  async getEntry(id: string): Promise<AuditLogEntry | null> {
    const { ObjectId } = await import('mongodb');
    if (!ObjectId.isValid(id)) return null;
    const collection = await this.getCollection();
    return collection.findOne({ _id: new ObjectId(id) as any });
  }

  async findWithFilters(
    filters: AuditLogFilters,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<AuditLogEntry>> {
    const collection = await this.getCollection();
    const query: Record<string, unknown> = {};

    if (filters.tenantId) query.tenantId = filters.tenantId;
    if (filters.category) query.category = filters.category;
    if (filters.severity) query.severity = filters.severity;
    if (filters.action) query.action = { $regex: filters.action, $options: 'i' };
    if (filters.entityType) query.entityType = filters.entityType;
    if (filters.entityId) query.entityId = filters.entityId;
    if (filters.userId) query.userId = filters.userId;
    if (filters.startDate || filters.endDate) {
      query.recordedAt = {};
      if (filters.startDate) (query.recordedAt as any).$gte = filters.startDate;
      if (filters.endDate) (query.recordedAt as any).$lte = filters.endDate;
    }

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      collection.find(query).sort({ sequence: -1 }).skip(skip).limit(limit).toArray(),
      collection.countDocuments(query),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }
}

export const auditLogRepository = new AuditLogRepository();