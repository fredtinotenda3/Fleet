// app/(protected)/workflows/instances/page.tsx
//
// Wrapped in Suspense because WorkflowInstancesPage reads entityType/
// entityId query params via useSearchParams(), which Next.js 15
// requires to be inside a Suspense boundary during static rendering
// (same pattern as app/(protected)/workorders/page.tsx).

import { Suspense } from 'react';
import { WorkflowInstancesPage } from '@/frontend/modules/workflows/pages';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';

export default function Page() {
  return (
    <Suspense fallback={<LoadingState type="table" count={6} />}>
      <WorkflowInstancesPage />
    </Suspense>
  );
}
