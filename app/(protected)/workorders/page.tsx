// app/(protected)/workorders/page.tsx
//
// Wrapped in Suspense because WorkOrderListPage reads the
// `license_plate` query param via useSearchParams(), which Next.js 15
// requires to be inside a Suspense boundary during static rendering
// (same pattern as app/auth/login/page.tsx).

import { Suspense } from 'react';
import { WorkOrderListPage } from '@/frontend/modules/workorders';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';

export default function Page() {
  return (
    <Suspense fallback={<LoadingState type="table" count={6} />}>
      <WorkOrderListPage />
    </Suspense>
  );
}