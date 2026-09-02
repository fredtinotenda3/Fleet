// app/(protected)/workflows/page.tsx
//
// Route shim for the Workflow Definitions page. Rendering and data
// fetching live in frontend/modules/workflows.
//
// GET /api/workflows enforces Permission.WORKFLOW_VIEW independently --
// reaching this page is not authorization. WorkflowDefinitionsPage
// additionally checks the same permission client-side so a user
// without it sees a clear message instead of a failed fetch.

import { WorkflowDefinitionsPage } from '@/frontend/modules/workflows/pages';

export default function Page() {
  return <WorkflowDefinitionsPage />;
}
