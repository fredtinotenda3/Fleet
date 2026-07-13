// app/(protected)/reports/builder/page.tsx

import type { Metadata } from 'next';
import ReportBuilder from '@/frontend/modules/reports/pages/ReportBuilder';

export const metadata: Metadata = {
  title: 'New Report | Report Builder',
};

export default function NewReportBuilderPage() {
  return <ReportBuilder />;
}