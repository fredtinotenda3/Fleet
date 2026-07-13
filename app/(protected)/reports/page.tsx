// app/(protected)/reports/page.tsx
//
// Entry point for /reports - the Executive Dashboard is the landing view of
// the Reporting Center.

import type { Metadata } from 'next';
import ExecutiveDashboard from '@/frontend/modules/reports/pages/ExecutiveDashboard';

export const metadata: Metadata = {
  title: 'Executive Dashboard | Reports',
  description: 'Fleet-wide cost, utilization, and health KPIs.',
};

export default function ReportsPage() {
  return <ExecutiveDashboard />;
}