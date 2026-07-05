// modules/reports/repositories/report.repository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import { Filter, ObjectId } from 'mongodb';
import { Report } from '../types/report.types';

export class ReportRepository extends BaseRepository<Report> {
  protected collectionName = 'tblreports';

  async findByUser(
    userId: string,
    tenantId: string,
    limit: number = 50
  ): Promise<Report[]> {
    return this.findMany(
      { generatedBy: userId } as Filter<Report>,
      tenantId,
      { limit, sortBy: 'generatedAt', sortOrder: 'desc' }
    );
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: Report['status'],
    fields?: Partial<Pick<Report, 'fileUrl' | 'fileKey' | 'fileSize'>>
  ): Promise<Report | null> {
    return this.update(id, { status, ...fields } as Partial<Report>, tenantId);
  }

  async incrementDownloadCount(id: string, tenantId: string): Promise<void> {
    const collection = await this.getCollection();
    if (!ObjectId.isValid(id)) return;
    
    // Use unknown as intermediate cast to resolve ObjectId vs string _id type mismatch
    const filter = {
      ...this.getActiveFilter(tenantId),
      _id: new ObjectId(id),
    } as unknown as Filter<Report>;
    
    await collection.updateOne(filter, { $inc: { downloadCount: 1 } as any });
  }

  async deleteExpiredReports(tenantId: string, olderThanDays: number = 90): Promise<number> {
    const collection = await this.getCollection();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    // Use unknown as intermediate cast to resolve type incompatibility
    const filter = {
      ...this.getActiveFilter(tenantId),
      generatedAt: { $lt: cutoff },
    } as unknown as Filter<Report>;

    const result = await collection.deleteMany(filter);
    return result.deletedCount || 0;
  }
}

export const reportRepository = new ReportRepository();