// app/(protected)/observability/telematics/providers/page.tsx
//
// Route shim for the Provider Health dashboard. Rendering and data
// fetching live in frontend/modules/observability.
//
// GET /api/observability/telematics/providers enforces
// Permission.PLATFORM_VIEW independently -- reaching this page is not
// authorization. ProviderHealthDashboardPage additionally checks the
// same permission client-side so a user without it sees a clear
// message instead of a failed fetch.

import { ProviderHealthDashboardPage } from '@/frontend/modules/observability/pages';

export default function Page() {
  return <ProviderHealthDashboardPage />;
}
