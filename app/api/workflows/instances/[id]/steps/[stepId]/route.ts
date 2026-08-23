// app/api/workflows/instances/[id]/steps/[stepId]/route.ts
//
// PHASE 0, F-4. This file previously contained a mis-pasted copy of
// app/api/workflows/instances/[id]/route.ts -- same header comment,
// `params: { id }` with no `stepId`, handlers calling getInstance and
// cancelInstance. The `[stepId]` segment was required by the path and
// then never read, so ANY value satisfied it: a caller could cancel
// instance `abc` by requesting DELETE /instances/abc/steps/anything.
//
// Those handlers are gone (restored to their correct path). Approving
// and rejecting are separate sub-routes rather than one verb on this
// path, because they take different payloads (comment vs a required
// reason) and carry different permissions -- collapsing them into one
// handler with an `action` discriminator would mean one route gate for
// two different privileges.
//
// Retained as an explicit 410 rather than deleted, following the
// precedent set by app/api/vehicles/direct/route.ts: a silent 404 on a
// path that used to work reads as an outage to whoever calls it, and
// this one had a genuine (if wrongly-routed) caller contract.
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      error:
        'This endpoint has been removed. Use GET /api/workflows/instances/{id} to read an instance, ' +
        'or POST /api/workflows/instances/{id}/steps/{stepId}/approve|reject to decide a step.',
      code: 'ENDPOINT_RETIRED',
    },
    { status: 410 }
  );
}

export const DELETE = GET;
