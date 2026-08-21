// app/(protected)/telematics/trackers/page.tsx
//
// Route shim for the Eagle Track tracker mapping admin screen.
// Rendering and data fetching live in frontend/modules/telematics.
//
// The API routes behind this screen enforce VEHICLE_VIEW (read) and
// VEHICLE_EDIT (write) independently -- reaching this page is not
// authorization.

import { TrackerMappingPage } from '@/frontend/modules/telematics/pages';

export default function Page() {
  return <TrackerMappingPage />;
}
