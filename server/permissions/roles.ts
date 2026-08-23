// server/permissions/roles.ts

import { OrgUnitType } from '@/modules/security/types/org-unit.types';

export enum Role {
  SUPER_ADMIN = 'super_admin',
  ORGANIZATION_OWNER = 'organization_owner',
  /**
   * PHASE A (Enterprise role/scope foundation): full-tenant operational
   * role, identical permission set to ORGANIZATION_OWNER today (the
   * Permission enum has no granular billing/ownership-transfer
   * permission to carve out yet -- see the audit note below). The two
   * are kept as distinct roles because "only one owner per org" /
   * ownership-transfer rules are business logic enforced elsewhere
   * (OrganizationService), not something the Permission enum
   * differentiates. Do not assume ORGANIZATION_ADMIN can be permission-
   * gated separately from OWNER until a dedicated billing/ownership
   * permission is introduced.
   */
  ORGANIZATION_ADMIN = 'organization_admin',
  /** Scoped to a single `branch`-type OrgUnit via UserScopeAssignment. */
  BRANCH_MANAGER = 'branch_manager',
  /** Scoped to a single `department`-type OrgUnit via UserScopeAssignment. */
  DEPARTMENT_MANAGER = 'department_manager',
  FLEET_MANAGER = 'fleet_manager',
  /** Scoped to a single `workshop`-type OrgUnit via UserScopeAssignment. */
  WORKSHOP_MANAGER = 'workshop_manager',
  /** Unscoped-level role (no fixed OrgUnitType) for team/shift oversight. */
  SUPERVISOR = 'supervisor',
  ACCOUNTANT = 'accountant',
  DISPATCHER = 'dispatcher',
  DRIVER = 'driver',
  MECHANIC = 'mechanic',
  AUDITOR = 'auditor',
  VIEWER = 'viewer',
}

export enum Permission {
  // Ã¢â€â‚¬Ã¢â€â‚¬ Organization Ã¢â€â‚¬Ã¢â€â‚¬
  ORG_VIEW = 'org:view',
  ORG_MANAGE = 'org:manage',
  ORG_SETTINGS = 'org:settings',
  ORG_MEMBERS_MANAGE = 'org:members:manage',

  // Ã¢â€â‚¬Ã¢â€â‚¬ Vehicle Ã¢â€â‚¬Ã¢â€â‚¬
  VEHICLE_VIEW = 'vehicle:view',
  VEHICLE_CREATE = 'vehicle:create',
  VEHICLE_EDIT = 'vehicle:edit',
  VEHICLE_DELETE = 'vehicle:delete',

  // Ã¢â€â‚¬Ã¢â€â‚¬ Expense Ã¢â€â‚¬Ã¢â€â‚¬
  EXPENSE_VIEW = 'expense:view',
  EXPENSE_CREATE = 'expense:create',
  EXPENSE_EDIT = 'expense:edit',
  EXPENSE_DELETE = 'expense:delete',
  EXPENSE_APPROVE = 'expense:approve',

  // Ã¢â€â‚¬Ã¢â€â‚¬ Fuel Ã¢â€â‚¬Ã¢â€â‚¬
  FUEL_VIEW = 'fuel:view',
  FUEL_CREATE = 'fuel:create',
  FUEL_EDIT = 'fuel:edit',
  FUEL_DELETE = 'fuel:delete',

  // Ã¢â€â‚¬Ã¢â€â‚¬ Maintenance Ã¢â€â‚¬Ã¢â€â‚¬
  MAINTENANCE_VIEW = 'maintenance:view',
  MAINTENANCE_CREATE = 'maintenance:create',
  MAINTENANCE_EDIT = 'maintenance:edit',
  MAINTENANCE_DELETE = 'maintenance:delete',
  MAINTENANCE_COMPLETE = 'maintenance:complete',

  // Ã¢â€â‚¬Ã¢â€â‚¬ Trip Ã¢â€â‚¬Ã¢â€â‚¬
  TRIP_VIEW = 'trip:view',
  TRIP_CREATE = 'trip:create',
  TRIP_EDIT = 'trip:edit',
  TRIP_DELETE = 'trip:delete',

  // Ã¢â€â‚¬Ã¢â€â‚¬ Analytics Ã¢â€â‚¬Ã¢â€â‚¬
  ANALYTICS_VIEW = 'analytics:view',
  ANALYTICS_EXPORT = 'analytics:export',

  // Ã¢â€â‚¬Ã¢â€â‚¬ Reports Ã¢â€â‚¬Ã¢â€â‚¬
  REPORT_VIEW = 'report:view',
  REPORT_CREATE = 'report:create',
  REPORT_DELETE = 'report:delete',
  REPORT_SCHEDULE = 'report:schedule',

  // Ã¢â€â‚¬Ã¢â€â‚¬ Users Ã¢â€â‚¬Ã¢â€â‚¬
  USER_VIEW = 'user:view',
  USER_CREATE = 'user:create',
  USER_EDIT = 'user:edit',
  USER_DELETE = 'user:delete',

  // Ã¢â€â‚¬Ã¢â€â‚¬ Driver-specific Ã¢â€â‚¬Ã¢â€â‚¬
  DRIVER_ASSIGN = 'driver:assign',
  DRIVER_VIEW_TRIPS = 'driver:view:trips',

  // Ã¢â€â‚¬Ã¢â€â‚¬ Mechanic-specific Ã¢â€â‚¬Ã¢â€â‚¬
  MECHANIC_VIEW_MAINTENANCE = 'mechanic:view:maintenance',
  MECHANIC_UPDATE_STATUS = 'mechanic:update:status',

  // Ã¢â€â‚¬Ã¢â€â‚¬ FleetOps Ã¢â‚¬â€œ Dispatch Ã¢â€â‚¬Ã¢â€â‚¬
  DISPATCH_VIEW = 'dispatch:view',
  DISPATCH_CREATE = 'dispatch:create',
  DISPATCH_ASSIGN = 'dispatch:assign',
  DISPATCH_MANAGE = 'dispatch:manage',

  // Ã¢â€â‚¬Ã¢â€â‚¬ FleetOps Ã¢â‚¬â€œ Schedule / Shifts Ã¢â€â‚¬Ã¢â€â‚¬
  SCHEDULE_SHIFT_VIEW = 'schedule_shift:view',
  SCHEDULE_SHIFT_MANAGE = 'schedule_shift:manage',

  // Ã¢â€â‚¬Ã¢â€â‚¬ FleetOps Ã¢â‚¬â€œ Booking Ã¢â€â‚¬Ã¢â€â‚¬
  BOOKING_VIEW = 'booking:view',
  BOOKING_CREATE = 'booking:create',
  BOOKING_APPROVE = 'booking:approve',
  BOOKING_MANAGE = 'booking:manage',

  // Ã¢â€â‚¬Ã¢â€â‚¬ FleetOps Ã¢â‚¬â€œ Work Orders Ã¢â€â‚¬Ã¢â€â‚¬
  WORKORDER_VIEW = 'workorder:view',
  WORKORDER_CREATE = 'workorder:create',
  WORKORDER_ASSIGN = 'workorder:assign',
  WORKORDER_COMPLETE = 'workorder:complete',
  WORKORDER_MANAGE = 'workorder:manage',

  // ---- FleetOps - Driver Vehicle Inspection Reports (DVIR) ----
  /** Submit a pre-trip/post-trip inspection for a vehicle in your own org unit. */
  DVIR_CREATE = 'dvir:create',
  /** View inspection history/detail (own submissions for drivers; in-scope fleet for managers/mechanics). */
  DVIR_VIEW = 'dvir:view',

  // Ã¢â€â‚¬Ã¢â€â‚¬ FleetOps Ã¢â‚¬â€œ Workshop Ã¢â€â‚¬Ã¢â€â‚¬
  WORKSHOP_VIEW = 'workshop:view',
  WORKSHOP_MANAGE = 'workshop:manage',

  // Ã¢â€â‚¬Ã¢â€â‚¬ FleetOps Ã¢â‚¬â€œ Inventory / Spare Parts Ã¢â€â‚¬Ã¢â€â‚¬
  INVENTORY_VIEW = 'inventory:view',
  INVENTORY_MANAGE = 'inventory:manage',
  INVENTORY_ADJUST = 'inventory:adjust',

  // Ã¢â€â‚¬Ã¢â€â‚¬ FleetOps Ã¢â‚¬â€œ Procurement Ã¢â€â‚¬Ã¢â€â‚¬
  PROCUREMENT_VIEW = 'procurement:view',
  PROCUREMENT_REQUEST = 'procurement:request',
  PROCUREMENT_APPROVE = 'procurement:approve',
  PROCUREMENT_MANAGE = 'procurement:manage',

  // Ã¢â€â‚¬Ã¢â€â‚¬ FleetOps Ã¢â‚¬â€œ Vendor Ã¢â€â‚¬Ã¢â€â‚¬
  VENDOR_VIEW = 'vendor:view',
  VENDOR_MANAGE = 'vendor:manage',

  // Ã¢â€â‚¬Ã¢â€â‚¬ FleetOps Ã¢â‚¬â€œ SLA Ã¢â€â‚¬Ã¢â€â‚¬
  SLA_VIEW = 'sla:view',
  SLA_MANAGE = 'sla:manage',

  // Ã¢â€â‚¬Ã¢â€â‚¬ FleetOps Ã¢â‚¬â€œ Compliance Ã¢â€â‚¬Ã¢â€â‚¬
  COMPLIANCE_VIEW = 'compliance:view',
  COMPLIANCE_MANAGE = 'compliance:manage',

  // Ã¢â€â‚¬Ã¢â€â‚¬ Security / Permission Engine (Slice 6a) Ã¢â€â‚¬Ã¢â€â‚¬
  CUSTOM_ROLE_VIEW = 'custom_role:view',
  CUSTOM_ROLE_MANAGE = 'custom_role:manage',
  ORG_UNIT_VIEW = 'org_unit:view',
  ORG_UNIT_MANAGE = 'org_unit:manage',
  RESOURCE_PERMISSION_VIEW = 'resource_permission:view',
  RESOURCE_PERMISSION_MANAGE = 'resource_permission:manage',
  SCOPE_ASSIGNMENT_VIEW = 'scope_assignment:view',
  SCOPE_ASSIGNMENT_MANAGE = 'scope_assignment:manage',

  // Ã¢â€â‚¬Ã¢â€â‚¬ Session Management & API Keys (Slice 6b) Ã¢â€â‚¬Ã¢â€â‚¬
  SESSION_VIEW = 'session:view',
  SESSION_MANAGE = 'session:manage',
  API_KEY_VIEW = 'api_key:view',
  API_KEY_MANAGE = 'api_key:manage',

  // Ã¢â€â‚¬Ã¢â€â‚¬ Immutable Audit Trail & Threat Detection (Slice 6c) Ã¢â€â‚¬Ã¢â€â‚¬
  AUDIT_LOG_VIEW = 'audit_log:view',
  AUDIT_LOG_VERIFY = 'audit_log:verify',
  SECURITY_EVENT_VIEW = 'security_event:view',
  ACCOUNT_LOCKOUT_MANAGE = 'account_lockout:manage',

  // Ã¢â€â‚¬Ã¢â€â‚¬ MFA & SSO (Slice 6d) Ã¢â€â‚¬Ã¢â€â‚¬
  MFA_MANAGE = 'mfa:manage',
  SSO_CONNECTION_VIEW = 'sso_connection:view',
  SSO_CONNECTION_MANAGE = 'sso_connection:manage',

  // Ã¢â€â‚¬Ã¢â€â‚¬ Phase 7 Ã¢â‚¬â€ True Multi-Tenancy / Platform Management Ã¢â€â‚¬Ã¢â€â‚¬
  PLATFORM_VIEW = 'platform:view',
  PLATFORM_MANAGE = 'platform:manage',
  ORG_UNIT_MOVE = 'org_unit:move',

  // Ã¢â€â‚¬Ã¢â€â‚¬ Jobs & Schedules (Platform Operations) Ã¢â€â‚¬Ã¢â€â‚¬
  JOB_VIEW = 'job:view',
  JOB_MANAGE = 'job:manage',
  SCHEDULE_VIEW = 'schedule:view',
  SCHEDULE_MANAGE = 'schedule:manage',

  // Ã¢â€â‚¬Ã¢â€â‚¬ Plugins / Integrations (Phase 10a) Ã¢â€â‚¬Ã¢â€â‚¬
  PLUGIN_VIEW = 'plugin:view',
  PLUGIN_MANAGE = 'plugin:manage',
  PLUGIN_REGISTER = 'plugin:register',

  // Ã¢â€â‚¬Ã¢â€â‚¬ Webhooks / Event Subscriptions (Phase 10b) Ã¢â€â‚¬Ã¢â€â‚¬
  WEBHOOK_VIEW = 'webhook:view',
  WEBHOOK_MANAGE = 'webhook:manage',

  // Ã¢â€â‚¬Ã¢â€â‚¬ OAuth Clients (Slice 10d) Ã¢â€â‚¬Ã¢â€â‚¬
  OAUTH_CLIENT_VIEW = 'oauth:client:view',
  OAUTH_CLIENT_MANAGE = 'oauth:client:manage',

  // Ã¢â€â‚¬Ã¢â€â‚¬ External Providers Ã¢â€â‚¬Ã¢â€â‚¬
  EXTERNAL_PROVIDER_VIEW = 'external:provider:view',
  EXTERNAL_PROVIDER_MANAGE = 'external:provider:manage',

  // -- Finance (cost-per-km engine: allocation ledger, depreciation, GL reconciliation) --
  /**
   * Read access to the allocation ledger, cost-per-km, depreciation
   * profiles and the GL reconciliation report. Granted to ACCOUNTANT and
   * BRANCH_MANAGER (a branch manager is accountable for their branch's
   * running costs, so read is operationally necessary), and to
   * SUPER_ADMIN/ORGANIZATION_OWNER/ORGANIZATION_ADMIN automatically via
   * the Object.values(Permission) grant below.
   *
   * A role gate only. WHICH postings a holder sees is decided separately
   * by TenantContext.accessibleOrgUnitIds -- every finance read path goes
   * through TenantScopedRepository.findManyInScope or an explicitly
   * scoped aggregation.
   */
  FINANCE_VIEW = 'finance:view',
  /**
   * Write access: posting and reversing allocations, editing depreciation
   * profiles, posting depreciation charges, submitting GL figures, and
   * changing organization finance settings.
   *
   * Deliberately NOT granted to BRANCH_MANAGER. Posting depreciation and
   * submitting general-ledger figures is an accounting function, not a
   * branch-operations one, and finance settings (reporting currency, FX
   * policy) are organization-level -- a branch changing them would
   * silently restate every other branch's reported costs.
   */
  FINANCE_MANAGE = 'finance:manage',

  // -- Notifications (Phase C -- hierarchy filtering) --
  /**
   * Governs creating an org-unit broadcast notification (not reading/
   * marking-read your own notifications -- that stays permission-free/
   * self-service, unchanged). Granted to SUPER_ADMIN/ORGANIZATION_OWNER/
   * ORGANIZATION_ADMIN automatically (rolePermissions below grants them
   * everything not platform-only), and explicitly to BRANCH_MANAGER/
   * FLEET_MANAGER/WORKSHOP_MANAGER. This is a role gate only -- it does
   * NOT establish which org unit a given manager may target; that's a
   * separate check against TenantContext.accessibleOrgUnitIds, see
   * modules/notifications/authorization/notification-broadcast.authorization.ts.
   */
  NOTIFICATION_BROADCAST = 'notification:broadcast',

  // -- Workflows / Approvals (PHASE 0, F-4) --
  //
  // modules/workflows previously had NO dedicated permission at all.
  // Every workflow route was wrapped in withSession() -- authenticated
  // only -- and workflowEngine.isAuthorizedForStep() returned `true`
  // for any step without an explicit assignee list, deferring to
  // "the API layer / permission middleware" that did not exist. The
  // combined effect was that any authenticated user in a tenant,
  // including a DRIVER, could approve or reject any role-assigned
  // workflow step and could create or delete workflow definitions.
  //
  // Split five ways rather than a single WORKFLOW_MANAGE because the
  // operations have genuinely different blast radii: authoring a
  // definition changes policy for the whole organization, whereas
  // approving a step acts on one instance. A supervisor who should
  // approve their own team's requests must not thereby gain the
  // ability to rewrite the approval chain itself.
  //
  // START and APPROVE/REJECT are separated from CANCEL because
  // cancelling terminates an in-flight instance somebody else may be
  // waiting on, which is closer to an administrative act than to
  // participating in the chain.
  WORKFLOW_VIEW = 'workflow:view',
  WORKFLOW_MANAGE = 'workflow:manage',
  WORKFLOW_START = 'workflow:start',
  WORKFLOW_APPROVE = 'workflow:approve',
  WORKFLOW_REJECT = 'workflow:reject',
  WORKFLOW_CANCEL = 'workflow:cancel',

  // -- Telematics ingestion (PHASE 0, F-5) --
  //
  // POST /api/telematics/ingest previously required only an
  // authenticated session: no permission, no check that the target
  // vehicle belonged to the caller's org unit, and no orgUnitId on the
  // written row. Any authenticated user -- a driver, a viewer -- could
  // fabricate position, speed, odometer and fuel level against ANY
  // vehicle in the tenant. That corrupts the digital twin, fires
  // geofence and speeding alerts, writes a false GPS trace into a
  // vehicle's history, and (once finance posts telemetry-driven costs)
  // corrupts the ledger. Writing with no orgUnitId also made the
  // corruption INVISIBLE to every scoped reader, i.e. harder to spot
  // than legitimate data.
  //
  // Deliberately its own permission rather than reusing VEHICLE_EDIT.
  // Editing a vehicle record is an administrative act a fleet manager
  // performs; asserting a measurement into the telemetry stream is a
  // MACHINE act, and the two populations are not the same. Reusing
  // VEHICLE_EDIT would have handed telemetry-write to every role that
  // can rename a vehicle.
  //
  // Granted to NO ordinary role below organization level. The intended
  // credential is a service identity (API key -- see
  // server/auth/auth-context.ts, which resolves API-key auth through
  // the same context as a session), not a human login. An operator who
  // needs a device to post here issues a key rather than widening a
  // human role.
  TELEMATICS_INGEST = 'telematics:ingest',
}

/**
 * Permissions that are restricted to SUPER_ADMIN only.
 * ORGANIZATION_OWNER/ORGANIZATION_ADMIN (and all other roles) must NOT
 * have these.
 *
 * FIX (Phase D finalization -- platform RBAC leak): JOB_VIEW, JOB_MANAGE,
 * SCHEDULE_VIEW, and SCHEDULE_MANAGE were previously missing from this
 * list. Since rolePermissions[ORGANIZATION_OWNER/ORGANIZATION_ADMIN] is
 * built as `Object.values(Permission).filter(p =>
 * !PLATFORM_ONLY_PERMISSIONS.includes(p))`, any permission not listed
 * here is granted to every organization owner/admin by default. That
 * meant any org owner could call the platform-wide job scheduler API
 * (app/api/admin/jobs/*): list every organization's dead-letter queue
 * entries (deadLetterService.listUnresolved('system', ...) intentionally
 * bypasses tenant filtering via the 'system' sentinel -- see
 * server/repositories/base.repository.ts's getTenantFilter -- because
 * that endpoint is meant for platform admins only), retry arbitrary
 * jobs, and create/pause/delete the platform's global cron schedules.
 * These four permissions are platform operations on shared
 * infrastructure (the job queue and cron catalogue), not organization
 * data, so they belong here alongside PLATFORM_VIEW/PLATFORM_MANAGE.
 */
const PLATFORM_ONLY_PERMISSIONS: Permission[] = [
  Permission.PLATFORM_VIEW,
  Permission.PLATFORM_MANAGE,
  Permission.PLUGIN_REGISTER,
  Permission.JOB_VIEW,
  Permission.JOB_MANAGE,
  Permission.SCHEDULE_VIEW,
  Permission.SCHEDULE_MANAGE,
];

export const rolePermissions: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: Object.values(Permission),

  [Role.ORGANIZATION_OWNER]: Object.values(Permission).filter(
    (p) => !PLATFORM_ONLY_PERMISSIONS.includes(p)
  ),

  // See the Role.ORGANIZATION_ADMIN doc comment above: identical
  // permission set to OWNER until a dedicated billing/ownership
  // permission exists to differentiate them.
  [Role.ORGANIZATION_ADMIN]: Object.values(Permission).filter(
    (p) => !PLATFORM_ONLY_PERMISSIONS.includes(p)
  ),

  /**
   * PHASE A: broad branch-level operational authority. Scoped to a
   * single branch (and its descendant departments/fleets/workshops) via
   * UserScopeAssignment + TenantContextService.resolveContext() -- this
   * role is intentionally NOT in FULL_ORG_UNIT_VISIBILITY_ROLES below,
   * so a branch manager with no scope assignment sees nothing (fail
   * closed) rather than the whole organization.
   */
  [Role.BRANCH_MANAGER]: [
    // PHASE 0, F-4. WORKFLOW_MANAGE (authoring/deleting definitions) is
    // deliberately NOT granted below organization level: a definition is
    // organization-wide policy, and a manager who can approve within their
    // own scope must not be able to rewrite the approval chain itself.
    // Holding WORKFLOW_APPROVE is necessary but NOT sufficient to approve a
    // given step -- workflowEngine.isAuthorizedForStep still requires the
    // actor to be the step's assignee or to hold its required role.
    Permission.WORKFLOW_VIEW,
    Permission.WORKFLOW_START,
    Permission.WORKFLOW_APPROVE,
    Permission.WORKFLOW_REJECT,
    Permission.WORKFLOW_CANCEL,
    Permission.ORG_VIEW,
    Permission.VEHICLE_VIEW,
    Permission.VEHICLE_CREATE,
    Permission.VEHICLE_EDIT,
    Permission.TRIP_VIEW,
    Permission.TRIP_CREATE,
    Permission.TRIP_EDIT,
    Permission.FUEL_VIEW,
    Permission.FUEL_CREATE,
    Permission.EXPENSE_VIEW,
    Permission.EXPENSE_CREATE,
    Permission.EXPENSE_EDIT,
    Permission.EXPENSE_APPROVE,
    Permission.MAINTENANCE_VIEW,
    Permission.MAINTENANCE_CREATE,
    Permission.MAINTENANCE_EDIT,
    Permission.ANALYTICS_VIEW,
    Permission.REPORT_VIEW,
    Permission.REPORT_CREATE,
    Permission.USER_VIEW,
    Permission.DRIVER_ASSIGN,
    Permission.DRIVER_VIEW_TRIPS,
    Permission.DISPATCH_VIEW,
    Permission.DISPATCH_CREATE,
    Permission.DISPATCH_ASSIGN,
    Permission.DISPATCH_MANAGE,
    Permission.SCHEDULE_SHIFT_VIEW,
    Permission.SCHEDULE_SHIFT_MANAGE,
    Permission.BOOKING_VIEW,
    Permission.BOOKING_APPROVE,
    Permission.BOOKING_MANAGE,
    Permission.WORKORDER_VIEW,
    Permission.WORKORDER_ASSIGN,
    Permission.WORKORDER_MANAGE,
    Permission.WORKSHOP_VIEW,
    Permission.INVENTORY_VIEW,
    Permission.DVIR_VIEW,
    Permission.PROCUREMENT_VIEW,
    Permission.PROCUREMENT_APPROVE,
    Permission.VENDOR_VIEW,
    Permission.SLA_VIEW,
    Permission.COMPLIANCE_VIEW,
    Permission.ORG_UNIT_VIEW,
    Permission.SCOPE_ASSIGNMENT_VIEW,
    Permission.NOTIFICATION_BROADCAST,
    // DELETE FOLLOWS CREATE+EDIT WITHIN SCOPE (policy change -- see note
    // at ROLE_PERMISSIONS). A role that can create and edit a record
    // must be able to remove one entered in error; otherwise every typo
    // escalates to an organization admin.
    Permission.EXPENSE_DELETE,
    Permission.FUEL_DELETE,
    Permission.TRIP_DELETE,
    Permission.MAINTENANCE_DELETE,
    // Finance -- READ ONLY, deliberately. A branch manager is
    // accountable for their branch's cost per km and must be able to see
    // it, but posting depreciation, submitting GL figures and changing
    // the organization's reporting currency or FX policy are accounting
    // functions with organization-wide effect. FINANCE_MANAGE stays with
    // ACCOUNTANT (and org owner/admin).
    Permission.FINANCE_VIEW,
  ],

  /**
   * PHASE A: narrower than BRANCH_MANAGER -- scoped to a single
   * `department`-type OrgUnit. Baseline permission set; product should
   * confirm before go-live (no department-level business rules were
   * provided in the source spec).
   */
  [Role.DEPARTMENT_MANAGER]: [
    // PHASE 0, F-4. WORKFLOW_MANAGE (authoring/deleting definitions) is
    // deliberately NOT granted below organization level: a definition is
    // organization-wide policy, and a manager who can approve within their
    // own scope must not be able to rewrite the approval chain itself.
    // Holding WORKFLOW_APPROVE is necessary but NOT sufficient to approve a
    // given step -- workflowEngine.isAuthorizedForStep still requires the
    // actor to be the step's assignee or to hold its required role.
    Permission.WORKFLOW_VIEW,
    Permission.WORKFLOW_START,
    Permission.WORKFLOW_APPROVE,
    Permission.WORKFLOW_REJECT,
    Permission.WORKFLOW_CANCEL,
    Permission.ORG_VIEW,
    Permission.VEHICLE_VIEW,
    Permission.TRIP_VIEW,
    Permission.TRIP_CREATE,
    Permission.TRIP_EDIT,
    Permission.FUEL_VIEW,
    Permission.EXPENSE_VIEW,
    Permission.EXPENSE_CREATE,
    Permission.EXPENSE_EDIT,
    Permission.MAINTENANCE_VIEW,
    Permission.ANALYTICS_VIEW,
    Permission.REPORT_VIEW,
    Permission.USER_VIEW,
    Permission.DISPATCH_VIEW,
    Permission.DISPATCH_CREATE,
    Permission.SCHEDULE_SHIFT_VIEW,
    Permission.SCHEDULE_SHIFT_MANAGE,
    Permission.BOOKING_VIEW,
    Permission.BOOKING_APPROVE,
    Permission.ORG_UNIT_VIEW,
    // DELETE FOLLOWS CREATE+EDIT WITHIN SCOPE (policy change -- see note
    // at ROLE_PERMISSIONS). A role that can create and edit a record
    // must be able to remove one entered in error; otherwise every typo
    // escalates to an organization admin.
    Permission.EXPENSE_DELETE,
    Permission.TRIP_DELETE,
  ],

  [Role.FLEET_MANAGER]: [
    // PHASE 0, F-4. WORKFLOW_MANAGE (authoring/deleting definitions) is
    // deliberately NOT granted below organization level: a definition is
    // organization-wide policy, and a manager who can approve within their
    // own scope must not be able to rewrite the approval chain itself.
    // Holding WORKFLOW_APPROVE is necessary but NOT sufficient to approve a
    // given step -- workflowEngine.isAuthorizedForStep still requires the
    // actor to be the step's assignee or to hold its required role.
    Permission.WORKFLOW_VIEW,
    Permission.WORKFLOW_START,
    Permission.WORKFLOW_APPROVE,
    Permission.WORKFLOW_REJECT,
    Permission.WORKFLOW_CANCEL,
    // Organization
    Permission.ORG_VIEW,
    // Vehicles
    Permission.VEHICLE_VIEW,
    Permission.VEHICLE_CREATE,
    Permission.VEHICLE_EDIT,
    // Maintenance
    Permission.MAINTENANCE_VIEW,
    Permission.MAINTENANCE_CREATE,
    Permission.MAINTENANCE_EDIT,
    Permission.MAINTENANCE_COMPLETE,
    // Trips
    Permission.TRIP_VIEW,
    // Fuel & Expenses
    Permission.FUEL_VIEW,
    Permission.EXPENSE_VIEW,
    // Analytics & Reports
    Permission.ANALYTICS_VIEW,
    Permission.REPORT_VIEW,
    Permission.REPORT_CREATE,
    // Drivers
    Permission.DRIVER_ASSIGN,
    // FleetOps Ã¢â‚¬â€œ Dispatch
    Permission.DISPATCH_VIEW,
    Permission.DISPATCH_CREATE,
    Permission.DISPATCH_ASSIGN,
    Permission.DISPATCH_MANAGE,
    // FleetOps Ã¢â‚¬â€œ Schedule / Shifts
    Permission.SCHEDULE_SHIFT_VIEW,
    Permission.SCHEDULE_SHIFT_MANAGE,
    // FleetOps Ã¢â‚¬â€œ Booking
    Permission.BOOKING_VIEW,
    Permission.BOOKING_CREATE,
    Permission.BOOKING_APPROVE,
    Permission.BOOKING_MANAGE,
    // FleetOps Ã¢â‚¬â€œ Work Orders
    Permission.WORKORDER_VIEW,
    Permission.WORKORDER_CREATE,
    Permission.WORKORDER_ASSIGN,
    Permission.WORKORDER_COMPLETE,
    Permission.WORKORDER_MANAGE,
    // FleetOps Ã¢â‚¬â€œ Driver Vehicle Inspection Reports (DVIR)
    Permission.DVIR_VIEW,
    // FleetOps Ã¢â‚¬â€œ Workshop
    Permission.WORKSHOP_VIEW,
    Permission.WORKSHOP_MANAGE,
    // FleetOps Ã¢â‚¬â€œ Inventory
    Permission.INVENTORY_VIEW,
    // FleetOps Ã¢â‚¬â€œ Procurement
    Permission.PROCUREMENT_VIEW,
    Permission.PROCUREMENT_REQUEST,
    // FleetOps Ã¢â‚¬â€œ Vendor
    Permission.VENDOR_VIEW,
    // FleetOps Ã¢â‚¬â€œ SLA & Compliance
    Permission.SLA_VIEW,
    Permission.COMPLIANCE_VIEW,
    // Org Units & Security
    Permission.ORG_UNIT_VIEW,
    Permission.ORG_UNIT_MOVE,
    Permission.CUSTOM_ROLE_VIEW,
    Permission.RESOURCE_PERMISSION_VIEW,
    Permission.SCOPE_ASSIGNMENT_VIEW,
    Permission.SECURITY_EVENT_VIEW,
    Permission.SSO_CONNECTION_VIEW,
    Permission.OAUTH_CLIENT_VIEW,
    Permission.EXTERNAL_PROVIDER_VIEW,
    Permission.NOTIFICATION_BROADCAST,
    // DELETE FOLLOWS CREATE+EDIT WITHIN SCOPE (policy change -- see note
    // at ROLE_PERMISSIONS). A role that can create and edit a record
    // must be able to remove one entered in error; otherwise every typo
    // escalates to an organization admin.
    Permission.FUEL_CREATE,
    Permission.FUEL_EDIT,
    Permission.FUEL_DELETE,
    Permission.EXPENSE_CREATE,
    Permission.EXPENSE_EDIT,
    Permission.MAINTENANCE_DELETE,
  ],

  /**
   * PHASE A: scoped to a single `workshop`-type OrgUnit. Superset of
   * MECHANIC with management authority over work orders/inventory for
   * that workshop.
   */
  [Role.WORKSHOP_MANAGER]: [
    // PHASE 0, F-4. WORKFLOW_MANAGE (authoring/deleting definitions) is
    // deliberately NOT granted below organization level: a definition is
    // organization-wide policy, and a manager who can approve within their
    // own scope must not be able to rewrite the approval chain itself.
    // Holding WORKFLOW_APPROVE is necessary but NOT sufficient to approve a
    // given step -- workflowEngine.isAuthorizedForStep still requires the
    // actor to be the step's assignee or to hold its required role.
    Permission.WORKFLOW_VIEW,
    Permission.WORKFLOW_START,
    Permission.WORKFLOW_APPROVE,
    Permission.WORKFLOW_REJECT,
    Permission.ORG_VIEW,
    Permission.VEHICLE_VIEW,
    Permission.MAINTENANCE_VIEW,
    Permission.MAINTENANCE_CREATE,
    Permission.MAINTENANCE_EDIT,
    Permission.MAINTENANCE_COMPLETE,
    Permission.MECHANIC_VIEW_MAINTENANCE,
    Permission.MECHANIC_UPDATE_STATUS,
    Permission.WORKORDER_VIEW,
    Permission.WORKORDER_CREATE,
    Permission.WORKORDER_ASSIGN,
    Permission.WORKORDER_COMPLETE,
    Permission.WORKORDER_MANAGE,
    Permission.DVIR_VIEW,
    Permission.WORKSHOP_VIEW,
    Permission.WORKSHOP_MANAGE,
    Permission.INVENTORY_VIEW,
    Permission.INVENTORY_MANAGE,
    Permission.INVENTORY_ADJUST,
    Permission.PROCUREMENT_VIEW,
    Permission.PROCUREMENT_REQUEST,
    Permission.VENDOR_VIEW,
    Permission.SLA_VIEW,
    Permission.COMPLIANCE_VIEW,
    Permission.ANALYTICS_VIEW,
    Permission.REPORT_VIEW,
    Permission.ORG_UNIT_VIEW,
    Permission.NOTIFICATION_BROADCAST,
    // DELETE FOLLOWS CREATE+EDIT WITHIN SCOPE (policy change -- see note
    // at ROLE_PERMISSIONS). A role that can create and edit a record
    // must be able to remove one entered in error; otherwise every typo
    // escalates to an organization admin.
    Permission.MAINTENANCE_DELETE,
  ],

  /**
   * PHASE A: unscoped-level (no fixed OrgUnitType requirement) team/
   * shift oversight role, above Driver/Dispatcher but without a
   * manager's write authority over expenses or vehicles.
   */
  [Role.SUPERVISOR]: [
    // PHASE 0, F-4. WORKFLOW_MANAGE (authoring/deleting definitions) is
    // deliberately NOT granted below organization level: a definition is
    // organization-wide policy, and a manager who can approve within their
    // own scope must not be able to rewrite the approval chain itself.
    // Holding WORKFLOW_APPROVE is necessary but NOT sufficient to approve a
    // given step -- workflowEngine.isAuthorizedForStep still requires the
    // actor to be the step's assignee or to hold its required role.
    Permission.WORKFLOW_VIEW,
    Permission.WORKFLOW_START,
    Permission.WORKFLOW_APPROVE,
    Permission.WORKFLOW_REJECT,
    Permission.ORG_VIEW,
    Permission.VEHICLE_VIEW,
    Permission.TRIP_VIEW,
    Permission.TRIP_CREATE,
    Permission.TRIP_EDIT,
    Permission.FUEL_VIEW,
    Permission.MAINTENANCE_VIEW,
    Permission.DRIVER_ASSIGN,
    Permission.DRIVER_VIEW_TRIPS,
    Permission.DISPATCH_VIEW,
    Permission.DISPATCH_CREATE,
    Permission.DISPATCH_ASSIGN,
    Permission.SCHEDULE_SHIFT_VIEW,
    Permission.SCHEDULE_SHIFT_MANAGE,
    Permission.BOOKING_VIEW,
    Permission.BOOKING_CREATE,
    Permission.REPORT_VIEW,
  ],

  [Role.ACCOUNTANT]: [
    // PHASE 0, F-4. WORKFLOW_MANAGE (authoring/deleting definitions) is
    // deliberately NOT granted below organization level: a definition is
    // organization-wide policy, and a manager who can approve within their
    // own scope must not be able to rewrite the approval chain itself.
    // Holding WORKFLOW_APPROVE is necessary but NOT sufficient to approve a
    // given step -- workflowEngine.isAuthorizedForStep still requires the
    // actor to be the step's assignee or to hold its required role.
    Permission.WORKFLOW_VIEW,
    Permission.WORKFLOW_APPROVE,
    Permission.WORKFLOW_REJECT,
    Permission.ORG_VIEW,
    Permission.VEHICLE_VIEW,
    Permission.EXPENSE_VIEW,
    Permission.EXPENSE_CREATE,
    Permission.EXPENSE_EDIT,
    Permission.EXPENSE_APPROVE,
    Permission.FUEL_VIEW,
    Permission.FUEL_CREATE,
    Permission.ANALYTICS_VIEW,
    Permission.ANALYTICS_EXPORT,
    Permission.REPORT_VIEW,
    Permission.REPORT_CREATE,
    // FleetOps Ã¢â‚¬â€œ Procurement (approve only)
    Permission.PROCUREMENT_VIEW,
    Permission.PROCUREMENT_APPROVE,
    // FleetOps Ã¢â‚¬â€œ Vendor
    Permission.VENDOR_VIEW,
    // DELETE FOLLOWS CREATE+EDIT WITHIN SCOPE (policy change -- see note
    // at ROLE_PERMISSIONS). A role that can create and edit a record
    // must be able to remove one entered in error; otherwise every typo
    // escalates to an organization admin.
    Permission.EXPENSE_DELETE,
    Permission.FUEL_DELETE,
    // Finance -- the cost-per-km engine's owning role. Both read and
    // write: posting allocations, depreciation runs, GL submissions and
    // finance settings are all accounting functions.
    Permission.FINANCE_VIEW,
    Permission.FINANCE_MANAGE,
  ],

  [Role.DISPATCHER]: [
    // PHASE 0, F-4. WORKFLOW_MANAGE (authoring/deleting definitions) is
    // deliberately NOT granted below organization level: a definition is
    // organization-wide policy, and a manager who can approve within their
    // own scope must not be able to rewrite the approval chain itself.
    // Holding WORKFLOW_APPROVE is necessary but NOT sufficient to approve a
    // given step -- workflowEngine.isAuthorizedForStep still requires the
    // actor to be the step's assignee or to hold its required role.
    Permission.WORKFLOW_VIEW,
    Permission.WORKFLOW_START,
    Permission.ORG_VIEW,
    Permission.VEHICLE_VIEW,
    Permission.TRIP_VIEW,
    Permission.TRIP_CREATE,
    Permission.TRIP_EDIT,
    Permission.MAINTENANCE_VIEW,
    Permission.DRIVER_ASSIGN,
    Permission.DRIVER_VIEW_TRIPS,
    // FleetOps Ã¢â‚¬â€œ Dispatch
    Permission.DISPATCH_VIEW,
    Permission.DISPATCH_CREATE,
    Permission.DISPATCH_ASSIGN,
    // FleetOps Ã¢â‚¬â€œ Schedule / Shifts
    Permission.SCHEDULE_SHIFT_VIEW,
    // FleetOps Ã¢â‚¬â€œ Booking
    Permission.BOOKING_VIEW,
  ],

  [Role.DRIVER]: [
    Permission.VEHICLE_VIEW,
    Permission.FUEL_CREATE,
    Permission.TRIP_CREATE,
    Permission.MAINTENANCE_VIEW,
    Permission.DRIVER_VIEW_TRIPS,
    // FleetOps Ã¢â‚¬â€œ Booking
    Permission.BOOKING_CREATE,
    Permission.BOOKING_VIEW,
    // FleetOps Ã¢â‚¬â€œ Schedule / Shifts
    Permission.SCHEDULE_SHIFT_VIEW,
    // FleetOps Ã¢â‚¬â€œ Driver Vehicle Inspection Reports (DVIR)
    Permission.DVIR_CREATE,
    Permission.DVIR_VIEW,
  ],

  [Role.MECHANIC]: [
    Permission.ORG_VIEW,
    Permission.VEHICLE_VIEW,
    Permission.MAINTENANCE_VIEW,
    Permission.MAINTENANCE_EDIT,
    Permission.MAINTENANCE_COMPLETE,
    Permission.MECHANIC_VIEW_MAINTENANCE,
    Permission.MECHANIC_UPDATE_STATUS,
    // FleetOps Ã¢â‚¬â€œ Work Orders
    Permission.WORKORDER_VIEW,
    Permission.WORKORDER_COMPLETE,
    // FleetOps Ã¢â‚¬â€œ Driver Vehicle Inspection Reports (DVIR)
    Permission.DVIR_VIEW,
    // FleetOps Ã¢â‚¬â€œ Workshop
    Permission.WORKSHOP_VIEW,
    // FleetOps Ã¢â‚¬â€œ Inventory
    Permission.INVENTORY_VIEW,
    Permission.INVENTORY_ADJUST,
  ],

  [Role.AUDITOR]: [
    // PHASE 0, F-4. WORKFLOW_MANAGE (authoring/deleting definitions) is
    // deliberately NOT granted below organization level: a definition is
    // organization-wide policy, and a manager who can approve within their
    // own scope must not be able to rewrite the approval chain itself.
    // Holding WORKFLOW_APPROVE is necessary but NOT sufficient to approve a
    // given step -- workflowEngine.isAuthorizedForStep still requires the
    // actor to be the step's assignee or to hold its required role.
    Permission.WORKFLOW_VIEW,
    Permission.ORG_VIEW,
    Permission.VEHICLE_VIEW,
    Permission.EXPENSE_VIEW,
    Permission.FUEL_VIEW,
    Permission.TRIP_VIEW,
    Permission.ANALYTICS_VIEW,
    Permission.ANALYTICS_EXPORT,
    Permission.REPORT_VIEW,
    Permission.ORG_UNIT_VIEW,
    Permission.CUSTOM_ROLE_VIEW,
    Permission.RESOURCE_PERMISSION_VIEW,
    Permission.SCOPE_ASSIGNMENT_VIEW,
    Permission.SESSION_VIEW,
    Permission.API_KEY_VIEW,
    Permission.AUDIT_LOG_VIEW,
    Permission.AUDIT_LOG_VERIFY,
    Permission.SECURITY_EVENT_VIEW,
    Permission.SSO_CONNECTION_VIEW,
    Permission.OAUTH_CLIENT_VIEW,
    Permission.EXTERNAL_PROVIDER_VIEW,
    // FleetOps Ã¢â‚¬â€œ Compliance, SLA, Vendor, Procurement
    Permission.COMPLIANCE_VIEW,
    Permission.SLA_VIEW,
    Permission.VENDOR_VIEW,
    Permission.PROCUREMENT_VIEW,
  ],

  [Role.VIEWER]: [
    // PHASE 0, F-4. WORKFLOW_MANAGE (authoring/deleting definitions) is
    // deliberately NOT granted below organization level: a definition is
    // organization-wide policy, and a manager who can approve within their
    // own scope must not be able to rewrite the approval chain itself.
    // Holding WORKFLOW_APPROVE is necessary but NOT sufficient to approve a
    // given step -- workflowEngine.isAuthorizedForStep still requires the
    // actor to be the step's assignee or to hold its required role.
    Permission.WORKFLOW_VIEW,
    Permission.ORG_VIEW,
    Permission.VEHICLE_VIEW,
    Permission.EXPENSE_VIEW,
    Permission.FUEL_VIEW,
    Permission.TRIP_VIEW,
    Permission.MAINTENANCE_VIEW,
    Permission.ANALYTICS_VIEW,
    Permission.REPORT_VIEW,
  ],
};

/**
 * PHASE A: single source of truth for "does this role see the whole
 * organization by default, or only what UserScopeAssignment grants it".
 *
 * Consumed by TenantContextService.resolveContext() (replaces that
 * file's own previously-hardcoded `ORG_WIDE_ROLES = ['organization_owner',
 * 'fleet_manager']`, which incorrectly gave every fleet manager
 * unrestricted organization-wide visibility regardless of their actual
 * fleet assignment).
 *
 * SUPER_ADMIN and ORGANIZATION_OWNER are listed here for clarity/
 * defense-in-depth even though both are also already short-circuited by
 * the `isSentinelTenant`/`isSuperAdmin` flag upstream in
 * TenantContextService and auth-context.ts -- if that upstream
 * short-circuit is ever refactored, this list still produces the
 * correct behavior on its own.
 *
 * Every other role -- including FLEET_MANAGER, BRANCH_MANAGER,
 * DEPARTMENT_MANAGER, WORKSHOP_MANAGER, SUPERVISOR, and all remaining
 * roles -- is scope-narrowed: with no UserScopeAssignment records they
 * see nothing (fail closed), not the whole organization.
 */
export const FULL_ORG_UNIT_VISIBILITY_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.ORGANIZATION_OWNER,
  Role.ORGANIZATION_ADMIN,
];

/**
 * PHASE A: which OrgUnitType a given static role's UserScopeAssignment
 * must target, if any. Used by UserScopeService.assign() to reject e.g.
 * assigning a BRANCH_MANAGER to a `workshop`-type org unit. Roles not
 * present in this map (SUPERVISOR, DRIVER, MECHANIC, ACCOUNTANT,
 * DISPATCHER, AUDITOR, VIEWER, and the two full-visibility roles) are
 * not level-restricted and may be scoped to any org unit type.
 */
export const ROLE_ORG_UNIT_LEVEL: Partial<Record<Role, OrgUnitType>> = {
  [Role.BRANCH_MANAGER]: 'branch',
  [Role.DEPARTMENT_MANAGER]: 'department',
  [Role.FLEET_MANAGER]: 'fleet',
  [Role.WORKSHOP_MANAGER]: 'workshop',
};

/**
 * PHASE A: every role that may legitimately appear on an
 * OrganizationMember record (i.e. everything except the platform-only
 * SUPER_ADMIN, which is never an organization membership role).
 * Replaces the hardcoded `VALID_ROLES` array duplicated in
 * modules/organizations/services/organization.service.ts and the
 * separate hardcoded z.enum(...) lists in
 * shared/validations/organization.schema.ts -- all three now derive
 * from this single array so adding/removing a role only ever requires
 * touching this file.
 */
export const ORGANIZATION_ROLES: Role[] = Object.values(Role).filter(
  (r) => r !== Role.SUPER_ADMIN
);

/**
 * PHASE A: roles assignable to a member *after* organization creation
 * (invite, "add member", role update) -- everything in
 * ORGANIZATION_ROLES except ORGANIZATION_OWNER, which is set once at
 * organization-creation time only and changed exclusively via an
 * explicit ownership-transfer flow, never a generic role update.
 */
export const ASSIGNABLE_ORGANIZATION_ROLES: Role[] = ORGANIZATION_ROLES.filter(
  (r) => r !== Role.ORGANIZATION_OWNER
);

export class PermissionService {
  hasPermission(userRoles: string[], requiredPermission: Permission): boolean {
    for (const userRole of userRoles) {
      const perms = rolePermissions[userRole as Role];
      if (perms?.includes(requiredPermission)) return true;
    }
    return false;
  }

  hasAnyPermission(userRoles: string[], requiredPermissions: Permission[]): boolean {
    return requiredPermissions.some((p) => this.hasPermission(userRoles, p));
  }

  hasAllPermissions(userRoles: string[], requiredPermissions: Permission[]): boolean {
    return requiredPermissions.every((p) => this.hasPermission(userRoles, p));
  }

  getPermissionsForRole(role: Role): Permission[] {
    return rolePermissions[role] || [];
  }

  getAllPermissions(): Permission[] {
    return Object.values(Permission);
  }
}

export const permissionService = new PermissionService();