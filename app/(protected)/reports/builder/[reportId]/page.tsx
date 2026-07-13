//app/(protected)/reports/builder/[reportId]/page.tsx

import type { Metadata } from 'next';
import ReportBuilder from '@/frontend/modules/reports/pages/ReportBuilder';

export const metadata: Metadata = {
  title: 'Edit Report | Report Builder',
};

interface PageProps {
  params: { reportId: string };
}

export default function EditReportBuilderPage({ params }: PageProps) {
  return <ReportBuilder reportId={params.reportId} />;
}