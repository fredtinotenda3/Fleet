// modules/compliance/repositories/compliance.repository.ts
import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { ComplianceRule, ComplianceRecord, ComplianceAppliesTo } from '../types/compliance.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

export class ComplianceRuleRepository extends BaseRepository<ComplianceRule> {
  protected collectionName = 'tblcompliancerules';

  async findActiveFor(appliesTo: ComplianceAppliesTo, tenantId: string): Promise<ComplianceRule[]> {
    return this.findMany({ appliesTo, status: 'active' } as Filter<ComplianceRule>, tenantId);
  }
}

export class ComplianceRecordRepository extends BaseRepository<ComplianceRecord> {
  protected collectionName = 'tblcompliancerecords';

  async getFiltered(entityType: ComplianceAppliesTo | undefined, status: string | undefined, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<ComplianceRecord>> {
    const filter: Record<string, unknown> = {};
    if (entityType) filter.entityType = entityType;
    if (status) filter.status = status;
    return this.findWithPagination(filter as Filter<ComplianceRecord>, pagination, tenantId);
  }

  async findOpenForEntity(entityType: ComplianceAppliesTo, entityId: string, tenantId: string): Promise<ComplianceRecord[]> {
    return this.findMany({ entityType, entityId, status: { $in: ['pending', 'due_soon', 'overdue'] } } as Filter<ComplianceRecord>, tenantId);
  }

  async findAllOpen(tenantId: string): Promise<ComplianceRecord[]> {
    return this.findMany({ status: { $in: ['pending', 'due_soon', 'overdue'] } } as Filter<ComplianceRecord>, tenantId, {}, false, true);
  }
}

export const complianceRuleRepository = new ComplianceRuleRepository();
export const complianceRecordRepository = new ComplianceRecordRepository();