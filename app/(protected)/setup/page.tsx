// app/(protected)/setup/page.tsx
//
// The Adaptive Onboarding / Setup Centre. Reachable at any time (no
// middleware gate); app/page.tsx's post-login redirect sends a
// first-time setup-permission holder here once, but this route itself
// never blocks anyone from navigating anywhere else.

import { SetupCentrePage } from '@/frontend/modules/onboarding';

export default function Page() {
  return <SetupCentrePage />;
}
