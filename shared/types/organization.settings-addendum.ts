// shared/types/organization.settings-addendum.ts
//
// contact / businessHours / taxSettings are now declared directly on the
// Organization interface in organization.types.ts (which imports the
// types below), and the extra settings fields listed further down are
// now declared on OrganizationSettings. This file remains the source of
// truth for those type definitions plus their Zod-adjacent defaults —
// it's just no longer a "TODO: merge me" note.

export interface OrganizationContactDetails {
  contactEmail: string;
  contactPhone?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
}

export interface BusinessHoursDay {
  enabled: boolean;
  openTime: string;  // "HH:MM"
  closeTime: string; // "HH:MM"
}

export interface OrganizationBusinessHours {
  monday: BusinessHoursDay;
  tuesday: BusinessHoursDay;
  wednesday: BusinessHoursDay;
  thursday: BusinessHoursDay;
  friday: BusinessHoursDay;
  saturday: BusinessHoursDay;
  sunday: BusinessHoursDay;
}

export interface OrganizationTaxSettings {
  taxId?: string;
  taxRate: number; // 0-100
  taxInclusivePricing: boolean;
}

export const DEFAULT_BUSINESS_HOURS: OrganizationBusinessHours = {
  monday: { enabled: true, openTime: '08:00', closeTime: '17:00' },
  tuesday: { enabled: true, openTime: '08:00', closeTime: '17:00' },
  wednesday: { enabled: true, openTime: '08:00', closeTime: '17:00' },
  thursday: { enabled: true, openTime: '08:00', closeTime: '17:00' },
  friday: { enabled: true, openTime: '08:00', closeTime: '17:00' },
  saturday: { enabled: false, openTime: '08:00', closeTime: '13:00' },
  sunday: { enabled: false, openTime: '08:00', closeTime: '13:00' },
};

export const DEFAULT_TAX_SETTINGS: OrganizationTaxSettings = {
  taxRate: 0,
  taxInclusivePricing: false,
};

// ---------------------------------------------------------------------
// ADAPTIVE ONBOARDING / SETUP CENTRE -- fleet operating posture
// ---------------------------------------------------------------------
// What the operator has TOLD us about how this fleet actually runs, so
// the Setup Centre (frontend/modules/onboarding) can stop asking and the
// rest of the platform can stop treating "no GPS yet" as "broken".
//
// Every field here is a DECLARATION, not an observation: it is written
// exactly once, by a person, through PATCH /api/organizations/[id]/
// fleet-profile, and is never inferred from telemetry/odometer data
// itself. `operatesWithoutGps: true` does not mean "no telematics
// device is currently reporting" (that is `telematicsConnected` in
// setup-checklist.ts, a real-time fact) -- it means an operator
// explicitly said this fleet does not use one, so the Setup Centre and
// the distance-source hierarchy (shared/types/evidence.types.ts) can
// stop nudging them toward a step that will never resolve on its own.
//
// Stored on Organization rather than a new collection: this is exactly
// the shape contact/businessHours/taxSettings already use, and a fourth
// instance of the same pattern does not earn a new collection (and
// therefore no module-scope.registry.ts entry is needed -- it is a
// field on the existing tblorganizations document).
export interface OrganizationFleetProfile {
  /** Operator declared this fleet runs without GPS/telematics for now. */
  operatesWithoutGps?: boolean;
  /** Operator declared this fleet's vehicles do not have reliable odometers. */
  operatesWithoutOdometers?: boolean;
  /** ISO timestamp set once a setup-permission holder finishes the Setup Centre. Absent = not yet completed. */
  setupCompletedAt?: string;
  /** Who completed it (userId) -- for the audit trail, same convention as `resolvedBy` elsewhere in this codebase. */
  setupCompletedBy?: string;
  /** ISO timestamp set if a setup-permission holder explicitly skips the Setup Centre without finishing. Honored by the post-login landing redirect: a fleet that chose to skip is never forced back onto it. */
  setupDismissedAt?: string;
}