// app/api/organizations/setup-status/route.ts
//
// ADAPTIVE ONBOARDING -- the client-side counterpart of app/page.tsx's
// server-side post-login redirect. LoginPage.tsx and MfaVerifyPage.tsx
// are client components and cannot call shouldRouteToSetupCentre()
// directly (it talks to the database), so this tiny, authenticated-only
// route is the one extra request they make, exactly once, right after a
// successful sign-in -- never on every page load.

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { getTenantFromRequest, getUserRolesFromRequest } from '@/server/utils/context.utils';
import { shouldRouteToSetupCentre } from '@/server/onboarding/setup-landing.service';
import { successResponse } from '@/server/utils/response.utils';

export const GET = withAuth(async (req: NextRequest) => {
  const tenantId = await getTenantFromRequest(req);
  const roles = await getUserRolesFromRequest(req);
  const shouldRouteToSetup = await shouldRouteToSetupCentre(roles, tenantId);
  return successResponse({ shouldRouteToSetup });
});
