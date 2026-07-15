// app/(protected)/reports/exports/page.tsx
//
// Entry point for /reports/exports - the Export Center.

import type { Metadata } from 'next';
import ExportCenter from '@/frontend/modules/reports/pages/ExportCenter';

export const metadata: Metadata = {
  title: 'Export Center | Reports',
  description: 'Generate and download reports, and track export history.',
};

export default function ExportCenterPage() {
  return <ExportCenter />;
}