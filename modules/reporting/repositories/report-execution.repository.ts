// modules/reporting/repositories/report-execution.repository.ts

import { Filter, ObjectId } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { ReportExecution, ExecutionStatus } from '../types/report-execution.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

export class ReportExecutionRepository extends BaseRepository<ReportExecution> {
  protected collectionName = 'tblreportexecutions';

  async findByOrganization(
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<ReportExecution>> {
    return this.findWithPagination({} as Filter<ReportExecution>, pagination, tenantId);
  }

  async findByDefinition(reportDefinitionId: string, tenantId: string): Promise<ReportExecution[]> {
    return this.findMany(
      { reportDefinitionId } as Filter<ReportExecution>,
      tenantId,
      { limit: 25, sortBy: 'generatedAt', sortOrder: 'desc' }
    );
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: ExecutionStatus,
    fields?: Partial<Pick<ReportExecution, 'fileUrl' | 'fileKey' | 'fileSize' | 'errorMessage' | 'emailedTo'>>
  ): Promise<ReportExecution | null> {
    return this.update(id, { status, ...fields } as Partial<ReportExecution>, tenantId);
  }

  async incrementDownloadCount(id: string, tenantId: string): Promise<void> {
    const collection = await this.getCollection();
    if (!ObjectId.isValid(id)) return;
    
    // Use unknown as intermediate cast to avoid type incompatibility between ObjectId and string _id
    const filter = {
      ...this.getActiveFilter(tenantId),
      _id: new ObjectId(id),
    } as unknown as Filter<ReportExecution>;
    
    await collection.updateOne(filter, { $inc: { downloadCount: 1 } as any });
  }

  async deleteOlderThan(tenantId: string, days: number): Promise<number> {
    const collection = await this.getCollection();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    // Use unknown as intermediate cast to avoid type incompatibility
    const filter = {
      ...this.getActiveFilter(tenantId),
      generatedAt: { $lt: cutoff },
    } as unknown as Filter<ReportExecution>;
    
    const result = await collection.deleteMany(filter);
    return result.deletedCount || 0;
  }
}

export const reportExecutionRepository = new ReportExecutionRepository();