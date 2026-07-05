// modules/compliance/types/compliance.types.ts
import { BaseEntity } from '@/shared/types/common.types';

export type ComplianceAppliesTo = 'vehicle' | 'driver' | 'organization';
export type ComplianceRecurrence = 'none' | 'monthly' | 'quarterly' | 'annual';
export type ComplianceRecordStatus = 'pending' | 'due_soon' | 'overdue' | 'resolved' | 'waived';

export interface ComplianceRule extends BaseEntity {
  name: string;
  appliesTo: ComplianceAppliesTo;
  description?: string;
  recurrence: ComplianceRecurrence;
  warningDays: number; // days before due date to flag "due_soon"
  status: 'active' | 'inactive';
}

export interface ComplianceRuleCreateDTO {
  name: string;
  appliesTo: ComplianceAppliesTo;
  description?: string;
  recurrence?: ComplianceRecurrence;
  warningDays?: number;
}

export interface ComplianceRecord extends BaseEntity {
  ruleId: string;
  entityType: ComplianceAppliesTo;
  entityId: string;
  dueDate: Date;
  status: ComplianceRecordStatus;
  resolvedAt?: Date;
  resolvedBy?: string;
  waiverReason?: string;
  documentUrl?: string;
}

export interface ComplianceRecordCreateDTO {
  ruleId: string;
  entityType: ComplianceAppliesTo;
  entityId: string;
  dueDate: Date | string;
  documentUrl?: string;
}