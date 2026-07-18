// modules/reporting/repositories/report-execution.repository.ts
//
// FIX (Consistency/drift-prevention): same rationale as dashboard.repository.ts.

import { Filter, ObjectId } from 'mongodb';
import { BaseRepository, isPlatformSentinelTenant } from '@/server/repositories/base.repository';
import { ReportExecution, ExecutionStatus } from '../types/report-execution.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

export class ReportExecutionRepository extends BaseRepository<ReportExecution> {
  protected collectionName = 'tblreportexecutions';

  async findByOrganization(
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<ReportExecution>> {
    return this.findWithPagination(
      {} as Filter<ReportExecution>,
      pagination,
      tenantId,
      false,
      isPlatformSentinelTenant(tenantId)
    );
  }

  /**
   * Used by report-execution.service.ts across pending -> processing ->
   * completed/failed transitions. `extra` carries the status-specific
   * fields (fileUrl/fileKey/fileSize on completion, errorMessage on
   * failure) so this stays one call per transition instead of a
   * status-set followed by a separate field-set.
   */
  async updateStatus(
    id: string,
    tenantId: string,
    status: ExecutionStatus,
    extra: Partial<ReportExecution> = {}
  ): Promise<ReportExecution | null> {
    return this.update(
      id,
      { status, ...extra } as Partial<Omit<ReportExecution, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>>,
      tenantId,
      undefined,
      isPlatformSentinelTenant(tenantId)
    );
  }

  async incrementDownloadCount(id: string, tenantId: string): Promise<void> {
    if (!ObjectId.isValid(id)) return;
    const collection = await this.getCollection();
    const filter: Record<string, unknown> = { _id: new ObjectId(id) };
    if (!isPlatformSentinelTenant(tenantId)) filter.tenantId = tenantId;

    await collection.updateOne(filter as Filter<ReportExecution>, {
      $inc: { downloadCount: 1 },
      $set: { updatedAt: new Date() },
    } as any);
  }
}

export const reportExecutionRepository = new ReportExecutionRepository();