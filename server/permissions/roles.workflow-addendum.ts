// server/permissions/roles.workflow-addendum.ts
//
// Follow-up: modules/workflows has NO dedicated permission in the
// Permission enum today -- the routes above were fixed to require only
// an authenticated session (withSession) as an immediate stopgap, not
// proper RBAC. Merge into server/permissions/roles.ts when ready:
//
// 1. Add to the Permission enum:
//
//   WORKFLOW_VIEW = 'workflow:view',
//   WORKFLOW_MANAGE = 'workflow:manage',      // create/update/delete definitions
//   WORKFLOW_START = 'workflow:start',        // start an instance against an entity
//   WORKFLOW_APPROVE = 'workflow:approve',    // approve/reject a step
//
// 2. Role.SUPER_ADMIN and Role.ORGANIZATION_OWNER already cover every
//    new permission automatically (Object.values(Permission)).
//
// 3. Suggested starting grants for Role.FLEET_MANAGER:
//
//   Permission.WORKFLOW_VIEW,
//   Permission.WORKFLOW_START,
//   Permission.WORKFLOW_APPROVE,
//
// 4. Once merged, update the route files above from withSession() to
//    withAuth(handler, { permission: Permission.WORKFLOW_VIEW }) etc.,
//    and -- critically -- approveStep/rejectStep in workflowController
//    must ALSO verify the caller is the specific step's assigned
//    approver, not just that they hold WORKFLOW_APPROVE generally.
//    Permission alone answers "can this role approve workflow steps at
//    all", not "is this the right person for this step" -- that second
//    check has to happen against the step's assignee, same class of
//    resource-level check canPerform()/ResourcePermission already
//    exists for elsewhere in this codebase.