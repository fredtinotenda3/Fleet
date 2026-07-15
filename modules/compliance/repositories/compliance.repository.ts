// File: modules/compliance/repositories/compliance.repository.ts
//
// FIX (🔴 Critical — cross-tenant data bypass): findAllOpen() previously
// called `this.findMany(filter, tenantId, {}, false, true)`, where the
// final `true` is BaseRepository's `isSuperAdmin` bypass flag. It was
// hardcoded true unconditionally, not gated on the caller actually
// having super-admin authority.
//
// findAllOpen() is invoked from ComplianceService.recalculateStatuses(),
// which is called from POST /api/compliance/recalculate — a route gated
// only by Permission.COMPLIANCE_MANAGE (an ordinary org-scoped
// permission held by e.g. fleet managers/org owners, not a platform
// super-admin check). With the bypass hardcoded on, any caller with
// COMPLIANCE_MANAGE in their own tenant would trigger a full
// recalculation across EVERY tenant's compliance records, firing
// ComplianceRecordOverdueEvent / ComplianceRecordDueSoonEvent for other
// organizations' data and mutating their record statuses.
//
// Fixed by removing the forced bypass. Tenant scoping now follows the
// same convention used elsewhere in the codebase (e.g.
// MaintenanceRepository, FuelRepository): BaseRepository's own
// tenant-filter logic already treats sentinel values like 'system' /
// 'default' / 'super_admin' as "no filter" when a caller legitimately
// needs a cross-tenant pass (e.g. a scheduled job calling this with
// tenantId: 'system'). A normal, real tenantId now stays scoped to that
// tenant only, exactly as every other read/write in this repository
// already behaves.

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

  /**
   * FIX: no longer forces the isSuperAdmin bypass. tenantId is passed
   * through untouched — BaseRepository's own sentinel-value handling
   * ('system'/'default'/'super_admin') is what determines whether this
   * is a cross-tenant pass, exactly as maintenanceRepository.getOverdueReminders
   * and equivalent methods elsewhere already work. A real, specific
   * tenantId now stays correctly scoped to that tenant only.
   */
  async findAllOpen(tenantId: string): Promise<ComplianceRecord[]> {
    return this.findMany({ status: { $in: ['pending', 'due_soon', 'overdue'] } } as Filter<ComplianceRecord>, tenantId);
  }
}

export const complianceRuleRepository = new ComplianceRuleRepository();
export const complianceRecordRepository = new ComplianceRecordRepository();