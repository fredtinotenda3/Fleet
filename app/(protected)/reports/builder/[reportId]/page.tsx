// app/(protected)/reports/builder/[reportId]/page.tsx
//
// FIX (Critical - inconsistent params typing): this route typed params as a
// plain object (`{ params: { reportId: string } }`) and read `params.reportId`
// synchronously. In Next.js 15's App Router, `params` is always a Promise at
// runtime regardless of how it's typed, so `reportId` was `undefined` on
// every request - ReportBuilder always rendered in "new report" mode instead
// of loading the existing definition. Matches the Promise convention already
// used correctly by app/api/reporting/definitions/[id]/route.ts.

import type { Metadata } from 'next';
import ReportBuilder from '@/frontend/modules/reports/pages/ReportBuilder';

export const metadata: Metadata = {
  title: 'Edit Report | Report Builder',
};

interface PageProps {
  params: Promise<{ reportId: string }>;
}

export default async function EditReportBuilderPage({ params }: PageProps) {
  const { reportId } = await params;
  return <ReportBuilder reportId={reportId} />;
}