// app/api/trips/route-preview/route.ts
//
// PART 3/4: live map-derived route preview for the Trip Log's
// map-assisted entry form, as the operator edits stops before saving.
// Gated by TRIP_CREATE -- the same permission the eventual save
// requires -- since this performs no vehicle-scope-sensitive read or
// write of its own (see TripController.previewRoute's doc comment).

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { tripController } from '@/modules/trips/controllers/trip.controller';

export const POST = withAuth(
  async (req: NextRequest) => tripController.previewRoute(req),
  { permission: Permission.TRIP_CREATE }
);
