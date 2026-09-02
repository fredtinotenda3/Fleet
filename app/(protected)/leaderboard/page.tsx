// app/(protected)/leaderboard/page.tsx
//
// Route shim for the Fleet Leaderboard. Rendering and data fetching
// live in frontend/modules/leaderboard.
//
// The underlying endpoints (GET /api/ai/dashboard,
// GET /api/reminders?action=stats|most-expensive-vehicles|repair-frequency)
// each enforce their own permission independently -- reaching this page
// is not authorization. See FleetLeaderboardPage for how the two
// different permissions (ANALYTICS_VIEW and MAINTENANCE_VIEW) degrade
// the page in halves rather than all-or-nothing.

import { FleetLeaderboardPage } from '@/frontend/modules/leaderboard/pages';

export default function Page() {
  return <FleetLeaderboardPage />;
}
