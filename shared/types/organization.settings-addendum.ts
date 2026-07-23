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