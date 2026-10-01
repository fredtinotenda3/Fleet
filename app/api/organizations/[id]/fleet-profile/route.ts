// app/api/organizations/[id]/fleet-profile/route.ts
//
// Adaptive Onboarding / Setup Centre -- declares how this fleet
// actually operates (GPS/odometer posture) and records when the Setup
// Centre was finished or explicitly skipped. Same route shape as the
// sibling /tax-settings, /business-hours, /contact sub-resources.

import { NextRequest } from 'next/server';
import { organizationController } from '@/modules/organizations/controllers/organization.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id } = await params;
    return organizationController.updateFleetProfile(req, id);
  },
  // Same permission the Setup Centre's own telematics step already
  // requires to complete it (setup-checklist.ts) -- not a new gate.
  { permission: Permission.ORG_SETTINGS }
);
