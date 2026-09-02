// app/(protected)/workflows/my-tasks/page.tsx
//
// Route shim for the My Tasks page. Rendering and data fetching live
// in frontend/modules/workflows.
//
// GET /api/workflows/instances/my-tasks enforces Permission.WORKFLOW_VIEW
// independently -- reaching this page is not authorization.
// WorkflowMyTasksPage additionally checks the same permission
// client-side so a user without it sees a clear message instead of a
// failed fetch.

import { WorkflowMyTasksPage } from '@/frontend/modules/workflows/pages';

export default function Page() {
  return <WorkflowMyTasksPage />;
}
