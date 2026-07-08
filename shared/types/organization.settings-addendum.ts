// shared/types/organization.settings-addendum.ts
//
// Merge these into shared/types/organization.types.ts's Organization
// interface. New optional top-level fields covering Phase 3 (contact,
// business hours, tax) that don't exist on Organization yet. Branding
// and OrganizationSettings already cover general info / regional /
// notification toggles, so those are untouched.

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

/**
 * Add to Organization interface in organization.types.ts:
 *
 *   contact?: OrganizationContactDetails;
 *   businessHours?: OrganizationBusinessHours;
 *   taxSettings?: OrganizationTaxSettings;
 *
 * Add to OrganizationSettings interface:
 *
 *   weeklyDigest?: boolean;
 *   criticalAlertsOnly?: boolean;
 *   requireMfa?: boolean;
 *   sessionTimeoutMinutes?: number;
 *   passwordMinLength?: number;
 *   passwordRequireSymbol?: boolean;
 *   passwordRequireNumber?: boolean;
 *   passwordExpiryDays?: number;
 */

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