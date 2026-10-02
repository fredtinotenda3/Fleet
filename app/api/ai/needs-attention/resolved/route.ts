// app/api/ai/needs-attention/resolved/route.ts
//
// MODULE CONNECTIVITY UPGRADE -- "Attention/Actions ↔ Outcome
// Verification" UI. A plain scoped read of persisted, already-resolved
// attention items (see ai.controller.ts#getResolvedAttentionItems /
// attentionResolutionService.listResolved) -- not a recomputation, so
// it does not need the live feed route's maxDuration=60/dynamic
// overrides (app/api/ai/needs-attention/route.ts's own header explains
// why those exist there).

import { NextRequest } from 'next/server';
import { aiController } from '@/modules/ai/controllers/ai.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => aiController.getResolvedAttentionItems(req),
  { permission: Permission.ANALYTICS_VIEW }
);
