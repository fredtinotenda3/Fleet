// modules/workorders/types/workorder.types.ts
import { BaseEntity, Priority } from '@/shared/types/common.types';

export type WorkOrderStatus = 'open' | 'assigned' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';

export interface WorkOrderPartUsage {
  sparePartId: string;
  quantity: number;
}

export interface WorkOrder extends BaseEntity {
  license_plate: string;
  title: string;
  description?: string;
  status: WorkOrderStatus;
  priority: Priority;
  reminderId?: string; // links back to a maintenance reminder if triggered from one
  bayId?: string;
  assignedMechanicId?: string;
  partsUsed: WorkOrderPartUsage[];
  laborHours?: number;
  laborCost?: number;
  partsCost: number;
  totalCost: number;
  openedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledReason?: string;
}

export interface WorkOrderCreateDTO {
  license_plate: string;
  title: string;
  description?: string;
  priority?: Priority;
  reminderId?: string;
}

export interface WorkOrderFilters {
  license_plate?: string;
  /**
   * WAVE 1 PART 2, item 7: `license_plate` alone matches as a
   * case-insensitive SUBSTRING (see workorder.repository.ts's
   * `buildScopedQuery` / shared/utils/regex.utils.ts's `containsMatch`)
   * -- correct for the Work Orders list page's search box (including
   * the "view this vehicle's work orders" link, which pre-fills that
   * same search box rather than opening a dedicated vehicle-only view),
   * wrong for a caller whose entire contract is "only this one
   * vehicle's work orders" -- see NeedsAttentionService.getFeedForVehicle,
   * the first caller that needs this. Plate "HRE123" would otherwise
   * also match "HRE1234" or "XHRE123Y". Mirrors
   * TripFilters.exactLicensePlate exactly.
   */
  exactLicensePlate?: boolean;
  status?: WorkOrderStatus;
  priority?: Priority;
  assignedMechanicId?: string;
}