// frontend/modules/dvir/types.ts
//
// Client-side mirror of modules/dvir/types/dvir.types.ts. Kept as a
// separate, dependency-free file (no imports from server/ or modules/)
// so it's always safe to import from 'use client' components -- the
// server module additionally imports a server-only repository type for
// its OrgUnitScopedEntity base, and duplicating the plain shapes here
// removes any risk of that ever leaking into the client bundle.

export type DVIRInspectionType = 'pre_trip' | 'post_trip';

export type DVIRItemCategory = 'tyres' | 'lights' | 'brakes' | 'body' | 'fluids' | 'other';

export type DVIRItemStatus = 'ok' | 'defect';

export type DVIROverallStatus = 'pass' | 'defects_found' | 'out_of_service';

export interface DVIRChecklistDefinition {
  category: DVIRItemCategory;
  label: string;
  helpText: string;
}

export const DVIR_CHECKLIST: DVIRChecklistDefinition[] = [
  { category: 'tyres', label: 'Tyres & wheels', helpText: 'Tread depth, sidewall damage, pressure, wheel nuts' },
  { category: 'lights', label: 'Lights & indicators', helpText: 'Headlights, brake lights, indicators, hazards' },
  { category: 'brakes', label: 'Brakes', helpText: 'Pedal feel, handbrake, warning lights' },
  { category: 'body', label: 'Body damage', helpText: 'Dents, cracks, mirrors, windscreen' },
  { category: 'fluids', label: 'Fluid levels', helpText: 'Oil, coolant, brake fluid, washer fluid' },
  { category: 'other', label: 'Other defects', helpText: 'Anything else that needs attention' },
];

export interface DVIRItemDraft {
  category: DVIRItemCategory;
  label: string;
  status: DVIRItemStatus;
  description: string;
  photoBase64?: string;
  photoMimeType?: string;
  /** Local object URL for previewing the captured photo before submit -- never sent to the server. */
  photoPreviewUrl?: string;
}

export interface DVIRVehicleOption {
  license_plate: string;
  make?: string;
  model?: string;
}

/** Shape queued in IndexedDB and posted to POST /api/dvir. */
export interface DVIRQueuedSubmission {
  clientInspectionId: string;
  license_plate: string;
  type: DVIRInspectionType;
  odometer?: number;
  outOfService: boolean;
  items: Array<{
    category: DVIRItemCategory;
    label: string;
    status: DVIRItemStatus;
    description?: string;
    photoBase64?: string;
    photoMimeType?: string;
  }>;
  queuedAt: number;
  attempts: number;
  lastError?: string;
  /** Set when the server rejected the payload itself (validation/scope) rather than a connectivity failure -- retrying identical bytes will never succeed, so the queue stops auto-retrying it, but it stays visible/queued until the driver dismisses it. Losing a safety-critical defect report silently is worse than an extra queued item. */
  permanentFailure?: boolean;
}

export interface DVIRInspectionSummary {
  _id: string;
  license_plate: string;
  type: DVIRInspectionType;
  overallStatus: DVIROverallStatus;
  outOfService: boolean;
  submittedAt: string;
  workOrderIds: string[];
  items: Array<{ category: DVIRItemCategory; label: string; status: DVIRItemStatus; description?: string }>;
}
