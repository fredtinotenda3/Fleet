// app/api/ai/needs-attention/route.ts

import { NextRequest } from 'next/server';
import { aiController } from '@/modules/ai/controllers/ai.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

// FIX (Vercel-only failure -- worked on localhost, always failed in
// prod): needsAttentionService.getFeed() fans out across all seven AI
// sources in parallel (predictive maintenance, fleet health, driver
// risk, fuel fraud, expense anomalies, compliance, maintenance) and
// then, on top of that, persists a snapshot into attention_items via a
// second per-item Promise.all (ownership resolution + upsert -- see
// needs-attention.service.ts persistFeed()). That total is at least as
// expensive as GET /api/ai/dashboard, which already needed the same
// two lines below to survive a cold Lambda / slow Atlas region on
// Vercel's default function timeout (10s Hobby, 15s Pro). This route
// never got them, so it was being killed mid-request on every single
// invocation in prod while a local `next dev` server (no such timeout)
// always had time to finish -- exactly the "localhost fine, Vercel
// always broken" symptom reported, surfacing to the widget as
// `isError` and the generic "Couldn't load the needs-attention feed
// right now." message.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export const GET = withAuth(
  (req: NextRequest) => aiController.getNeedsAttention(req),
  { permission: Permission.ANALYTICS_VIEW }
);
