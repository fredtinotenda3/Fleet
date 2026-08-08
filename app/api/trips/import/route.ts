// app/api/trips/import/route.ts
//
// BROKEN ENDPOINT FIX.
//
// This route called `tripController.importTrips(req)`. That method does
// not exist -- there is no import implementation anywhere in
// modules/trips. Every POST to /api/trips/import therefore threw
// `TypeError: tripController.importTrips is not a function`, which the
// controller's catch could not classify, producing an opaque 500.
// TS2551 flagged it ("Did you mean 'exportTrips'?") and
// `ignoreBuildErrors: true` shipped it.
//
// Returning 501 rather than silently implementing an importer: trip
// import needs a column mapping, a duplicate policy, and a decision on
// partial-failure handling (see ExpenseController.bulkImport for the
// shape this should take). Guessing those would create bad data, which
// is worse than an honest "not built yet". The endpoint now says what it
// is instead of crashing.

import { NextResponse } from 'next/server';

export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message:
          'Trip import is not implemented yet. Use POST /api/trips to create trips ' +
          'individually, or the expenses/fuel import endpoints as a reference for ' +
          'the intended bulk-import contract.',
      },
    },
    { status: 501 }
  );
}
