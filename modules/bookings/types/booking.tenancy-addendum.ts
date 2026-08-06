// modules/bookings/types/booking.tenancy-addendum.ts
//
// Phase B: a vehicle booking is scoped to whichever fleet/branch the
// booked vehicle belongs to, mirroring DispatchJob. Same additive
// module-augmentation pattern as the other *.tenancy-addendum.ts files
// in this pass.

import '../types/booking.types';

declare module '../types/booking.types' {
  interface Booking {
    /** The fleet (or branch) org unit the booked vehicle belongs to. */
    orgUnitId?: string;
  }
}