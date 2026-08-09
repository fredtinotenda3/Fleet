// app/(protected)/reports/gl-reconciliation/page.tsx
//
// Entry point for /reports/gl-reconciliation.

import type { Metadata } from 'next';
import GLReconciliationPage from '@/frontend/modules/finance/pages/GLReconciliationPage';

export const metadata: Metadata = {
  title: 'GL Reconciliation | Reports',
  description: 'Platform totals from the allocation ledger against submitted general-ledger figures, per account.',
};

export default function Page() {
  return <GLReconciliationPage />;
}
