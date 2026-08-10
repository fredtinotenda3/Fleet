// modules/dvir/types/dvir.types.ts
//
// Driver Vehicle Inspection Report (DVIR). A driver performs a
// pre-trip or post-trip checklist against one vehicle; any item marked
// "Defect Found" (optionally with a photo) automatically raises a work
// order in the maintenance/workshop module (see dvir.service.ts,
// DVIRService.submit -> workOrderService.create). Marking the whole
// inspection "Out of Service" additionally broadcasts a high-priority
// notification to the vehicle's workshop org unit.
//
// SCOPING
// Registered 'org-unit' in server/tenancy/module-scope.registry.ts,
// orgUnitSource 'vehicle' -- the inspection inherits the orgUnitId of
// the vehicle being inspected, exactly like workorders and maintenance.
// A driver can only submit or browse inspections for vehicles inside
// their own accessible org units (enforced in DVIRService.submit /
// DVIRRepository.getFilteredInScope via TenantContext).
//
// OFFLINE SYNC / IDEMPOTENCY
// The PWA queues submissions locally (IndexedDB) and retries them once
// connectivity returns. A retried submission after a partial failure
// (e.g. the response never reached the device) must not create a
// second inspection or a second work order. `clientInspectionId` is a
// UUID minted on-device at capture time; submit() upserts on
// {tenantId, driverId, clientInspectionId} so a resubmission of the
// same queued item returns the original result untouched -- see
// DVIRRepository.findByClientInspectionId.

import type { OrgUnitScopedEntity } from '@/server/repositories/tenant-scoped.repository';

export type DVIRInspectionType = 'pre_trip' | 'post_trip';

export type DVIRItemCategory =
  | 'tyres'
  | 'lights'
  | 'brakes'
  | 'body'
  | 'fluids'
  | 'other';

export type DVIRItemStatus = 'ok' | 'defect';

export type DVIROverallStatus = 'pass' | 'defects_found' | 'out_of_service';

/** One checklist row as persisted. Photos are stored via storageService; only the resulting URL/key is kept here. */
export interface DVIRItemResult {
  category: DVIRItemCategory;
  /** Human label, e.g. "Front left tyre" -- the checklist item shown in the UI. */
  label: string;
  status: DVIRItemStatus;
  /** Required by validation when status === 'defect'. */
  description?: string;
  photoUrl?: string;
  photoKey?: string;
}

export interface DVIRInspection extends OrgUnitScopedEntity {
  license_plate: string;
  driverId: string;
  driverName?: string;
  type: DVIRInspectionType;
  odometer?: number;
  items: DVIRItemResult[];
  /** Driver-declared "this vehicle must not be driven" flag, independent of individual item statuses. */
  outOfService: boolean;
  overallStatus: DVIROverallStatus;
  submittedAt: Date;
  /** Work orders auto-created from this inspection's defect items, in item order. */
  workOrderIds: string[];
  /** Device-minted idempotency key for offline-queue resubmission. Unique per {tenantId, driverId}. */
  clientInspectionId?: string;
}

/** One checklist row as submitted by the client. Photo travels as a data-URL/base64 payload; the server uploads it and discards the raw bytes. */
export interface DVIRItemInputDTO {
  category: DVIRItemCategory;
  label: string;
  status: DVIRItemStatus;
  description?: string;
  /** base64-encoded image bytes (no data: prefix) captured for a defect item. Optional even when status === 'defect' -- the UI encourages but does not force a photo. */
  photoBase64?: string;
  photoMimeType?: string;
}

export interface DVIRCreateDTO {
  license_plate: string;
  type: DVIRInspectionType;
  odometer?: number;
  items: DVIRItemInputDTO[];
  outOfService: boolean;
  clientInspectionId?: string;
}

export interface DVIRFilters {
  license_plate?: string;
  driverId?: string;
  type?: DVIRInspectionType;
  overallStatus?: DVIROverallStatus;
  outOfService?: boolean;
}

/**
 * The default checklist rendered by the PWA. Kept server-side too so
 * the API can validate that submitted items cover the required
 * categories rather than trusting an arbitrary client-supplied list.
 */
export const DVIR_CHECKLIST_ITEMS: ReadonlyArray<{ category: DVIRItemCategory; label: string }> = [
  { category: 'tyres', label: 'Tyres & wheels' },
  { category: 'lights', label: 'Lights & indicators' },
  { category: 'brakes', label: 'Brakes' },
  { category: 'body', label: 'Body damage' },
  { category: 'fluids', label: 'Fluid levels' },
  { category: 'other', label: 'Other defects' },
];
