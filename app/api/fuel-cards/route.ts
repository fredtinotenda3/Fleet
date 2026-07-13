// app/api/fuel-cards/route.ts
//
// FIX (🔴 Critical — no auth of any kind): this route had no auth
// wrapper at all — not even the legacy requireAuth(). Fuel cards carry
// financial/payment data; this was fully readable and writable by any
// unauthenticated caller, and (since fuelCardController relies entirely
// on getTenantFromRequest() for scoping, with no independent auth gate)
// there was nothing else in the request path stopping it. No dedicated
// FUEL_CARD_* permission exists in server/permissions/roles.ts, so this
// reuses Permission.FUEL_VIEW / FUEL_CREATE as a stopgap — matching the
// same reasoning already applied to app/api/meterlogs/route.ts for a
// similar gap. Flag for a dedicated permission if fuel cards should be
// restricted more tightly than general fuel data.

import { NextRequest } from 'next/server';
import { fuelCardController } from '@/modules/fuel-cards/controllers/fuel-card.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => fuelCardController.list(req),
  { permission: Permission.FUEL_VIEW }
);

export const POST = withAuth(
  (req: NextRequest) => fuelCardController.create(req),
  { permission: Permission.FUEL_CREATE }
);