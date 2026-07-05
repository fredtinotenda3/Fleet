// modules/sla/types/sla.types.ts
import { BaseEntity } from '@/shared/types/common.types';

export type SlaEntityType = 'work_order' | 'dispatch_job' | 'purchase_request' | 'booking';
export type SlaTrackingStatus = 'active' | 'met' | 'breached' | 'cancelled';

export interface SLAPolicy extends BaseEntity {
  name: string;
  entityType: SlaEntityType;
  priority?: string; // optional priority scoping, e.g. only applies to "critical"
  responseTimeMinutes: number;   // time to first action (e.g. assignment)
  resolutionTimeMinutes: number; // time to completion
  warningThresholdPercent: number; // e.g. 80 -> warn at 80% of resolution time elapsed
  status: 'active' | 'inactive';
}

export interface SLAPolicyCreateDTO {
  name: string;
  entityType: SlaEntityType;
  priority?: string;
  responseTimeMinutes: number;
  resolutionTimeMinutes: number;
  warningThresholdPercent?: number;
}

export interface SLATracking extends BaseEntity {
  policyId: string;
  entityType: SlaEntityType;
  entityId: string;
  startedAt: Date;
  respondedAt?: Date;
  targetAt: Date; // startedAt + resolutionTimeMinutes
  warningAt: Date;
  resolvedAt?: Date;
  status: SlaTrackingStatus;
  breachedAt?: Date;
}