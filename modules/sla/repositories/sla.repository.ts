// modules/sla/repositories/sla.repository.ts
import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { SLAPolicy, SLATracking, SlaEntityType } from '../types/sla.types';

export class SLAPolicyRepository extends BaseRepository<SLAPolicy> {
  protected collectionName = 'tblslapolicies';

  async findApplicable(entityType: SlaEntityType, priority: string | undefined, tenantId: string): Promise<SLAPolicy | null> {
    const withPriority = priority
      ? await this.findOne({ entityType, priority, status: 'active' } as Filter<SLAPolicy>, tenantId)
      : null;
    if (withPriority) return withPriority;
    return this.findOne({ entityType, priority: { $exists: false }, status: 'active' } as Filter<SLAPolicy>, tenantId);
  }
}

export class SLATrackingRepository extends BaseRepository<SLATracking> {
  protected collectionName = 'tblslatrackings';

  async findActiveForEntity(entityType: SlaEntityType, entityId: string, tenantId: string): Promise<SLATracking | null> {
    return this.findOne({ entityType, entityId, status: 'active' } as Filter<SLATracking>, tenantId);
  }

  async findDueForWarningOrBreach(tenantId: string): Promise<SLATracking[]> {
    return this.findMany({ status: 'active' } as Filter<SLATracking>, tenantId, {}, false, true);
  }
}

export const slaPolicyRepository = new SLAPolicyRepository();
export const slaTrackingRepository = new SLATrackingRepository();