// app/(protected)/observability/operational/page.tsx
//
// Route shim for the Operational Dashboard. Rendering and data
// fetching live in frontend/modules/observability.
//
// The underlying endpoints (GET /api/observability/telematics/providers,
// GET /api/observability/outbox, GET /api/observability/summary) each
// enforce their own permission independently -- reaching this page is
// not authorization. See OperationalDashboardPage for the permission
// note covering the one endpoint (summary) gated differently from the
// other two.

import { OperationalDashboardPage } from '@/frontend/modules/observability/pages';

export default function Page() {
  return <OperationalDashboardPage />;
}
