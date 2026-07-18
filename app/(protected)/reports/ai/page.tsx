
// app/(protected)/reports/ai/page.tsx
//
// FIX (Critical — GET /reports/ai 404): frontend/modules/reports/pages/AIReports.tsx
// was fully implemented and linked to from ExecutiveDashboard.tsx ("AI‑Powered
// Insights" -> href="/reports/ai"), but no route segment existed under
// app/(protected)/reports/ to render it — the App Router had no page.tsx to
// match, so every request 404'd before AIReports.tsx or any /api/ai/* call
// ever ran. This was a missing route file, not a missing controller, service,
// or API route. Matches the entry-point pattern already used by the sibling
// exports/scheduled/builder pages in this same directory.

import type { Metadata } from 'next';
import AIReports from '@/frontend/modules/reports/pages/AIReports';

export const metadata: Metadata = {
  title: 'AI-Powered Insights | Reports',
  description: 'Predictive maintenance, fuel fraud detection, expense anomalies, fleet health, and driver risk scoring.',
};

export default function ReportsAIPage() {
  return <AIReports />;
}