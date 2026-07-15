// app/(protected)/reports/scheduled/page.tsx
//
// Entry point for /reports/scheduled - recurring report schedules.

import type { Metadata } from 'next';
import ScheduledReports from '@/frontend/modules/reports/pages/ScheduledReports';

export const metadata: Metadata = {
  title: 'Scheduled Reports | Reports',
  description: 'Automatically generate and deliver reports on a recurring schedule.',
};

export default function ScheduledReportsPage() {
  return <ScheduledReports />;
}