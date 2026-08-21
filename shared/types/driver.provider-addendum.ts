// shared/types/driver.provider-addendum.ts
//
// Records which external telematics provider a driver row was imported
// from, and under what id.
//
// Same additive module-augmentation pattern as driver.tenancy-addendum.ts
// -- it does not touch driver.types.ts, so nothing that imports Driver
// today changes shape, and a build that does not import this file simply
// does not see the field.
//
// WHY A PROVIDER ID IS LOAD-BEARING, not decoration: it is the ONLY
// thing that lets a second run of the Eagle Track driver sync recognise
// a person it already imported. Without it the sync would fall back to
// name matching every time, and a driver renamed in the vendor UI (or
// two drivers who share a name) would produce a duplicate roster --
// which silently splits one person's fuel logs, trips, shifts and DVIRs
// across two records. See eagletrack-driver-sync.service.ts's header for
// the full resolution order.
//
// Nested rather than a flat `eagletrackDriverId` so a second provider
// can be added without another top-level column, and so the whole
// association can be removed in one $unset.

import '@/shared/types/driver.types';

declare module '@/shared/types/driver.types' {
  interface Driver {
    providerLink?: {
      provider: 'eagletrack';
      /** The vendor's own driver id. The reconciliation key. */
      providerDriverId: string;
      /**
       * Tracker the provider says this driver is assigned to.
       * INFORMATIONAL ONLY -- never used for scoping or matching. Our
       * tenancy is decided by the driver's own orgUnitId, never by a
       * field the vendor controls.
       */
      uin?: string;
      lastSyncedAt: Date;
    };
  }
}
