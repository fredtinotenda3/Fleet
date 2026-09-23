// app/api/transport-cost/normalization-review/route.ts
//
// Phase O2. Was never wired up despite the controller method
// (transportCostController.listNormalizationReviewQueue) already
// existing, tested, and doc-commented with this exact route path --
// found while onboarding Olivine's first real transport-cost data: an
// import can create PENDING review items (fuzzy-matched or entirely new
// transporter/vehicle identities), but with no route to list them,
// there was no way to ever see, let alone confirm, the queue outside a
// raw command invocation. Read-only, so it uses the same VIEW
// permission as /source-records rather than the write-oriented
// TRANSPORT_COST_NORMALIZE used by the confirm/reject routes alongside
// this one.

import { NextRequest } from 'next/server';
import { transportCostController } from '@/modules/transport-cost/controllers/transport-cost.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  async (req: NextRequest) => transportCostController.listNormalizationReviewQueue(req),
  { permission: Permission.TRANSPORT_COST_VIEW }
);
