// app/api/organizations/route.ts
//
// FIX (🔴 Critical — no auth of any kind): getMyOrganizations()
// necessarily needs to know who "my" is, and createOrganization()
// needs to know who the resulting owner is — neither can work correctly
// without an authenticated caller, yet neither had an auth wrapper.
// Self-service (any authenticated user may list their own orgs / create
// a new one), so withAuth() is used with no specific permission —
// matches app/api/organizations/[id]/route.ts's sibling pattern for
// self-scoped reads elsewhere in this module.

import { NextRequest } from 'next/server';
import { organizationController } from '@/modules/organizations/controllers/organization.controller';
import { withAuth } from '@/server/middleware/with-auth';

export const GET = withAuth((req: NextRequest) => organizationController.getMyOrganizations(req));
export const POST = withAuth((req: NextRequest) => organizationController.createOrganization(req));