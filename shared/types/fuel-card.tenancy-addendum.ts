// shared/types/fuel-card.tenancy-addendum.ts
//
// Adds the org-unit dimension to fuel cards.
//
// DECISION (see server/tenancy/module-scope.registry.ts): fuel cards are
// SCOPED, fuel stations are SHARED. The distinction is that a station is
// a place anyone may legitimately drive to, whereas a card is a payment
// instrument issued against one vehicle and carrying a spend limit and a
// PAN suffix. Another branch's card details and limits are a
// payment-fraud surface, not reference data.
//
// This decision is marked `confirmed: false` in the registry pending
// product sign-off. Flipping it is a one-line change to `level` there.
//
// BACKFILL: from the vehicle identified by FuelCard.license_plate.

import '@/shared/types/fuel-card.types';

declare module '@/shared/types/fuel-card.types' {
  interface FuelCard {
    /** Inherited from the vehicle the card is issued against. */
    orgUnitId?: string;
  }
}
