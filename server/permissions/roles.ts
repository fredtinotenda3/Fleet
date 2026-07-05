// server/permissions/roles.ts

export enum Role {
  SUPER_ADMIN = 'super_admin',
  ORGANIZATION_OWNER = 'organization_owner',
  FLEET_MANAGER = 'fleet_manager',
  ACCOUNTANT = 'accountant',
  DISPATCHER = 'dispatcher',
  DRIVER = 'driver',
  MECHANIC = 'mechanic',
  AUDITOR = 'auditor',
  VIEWER = 'viewer',
}

export enum Permission {
  // ── Organization ──
  ORG_VIEW = 'org:view',
  ORG_MANAGE = 'org:manage',
  ORG_SETTINGS = 'org:settings',
  ORG_MEMBERS_MANAGE = 'org:members:manage',

  // ── Vehicle ──
  VEHICLE_VIEW = 'vehicle:view',
  VEHICLE_CREATE = 'vehicle:create',
  VEHICLE_EDIT = 'vehicle:edit',
  VEHICLE_DELETE = 'vehicle:delete',

  // ── Expense ──
  EXPENSE_VIEW = 'expense:view',
  EXPENSE_CREATE = 'expense:create',
  EXPENSE_EDIT = 'expense:edit',
  EXPENSE_DELETE = 'expense:delete',
  EXPENSE_APPROVE = 'expense:approve',

  // ── Fuel ──
  FUEL_VIEW = 'fuel:view',
  FUEL_CREATE = 'fuel:create',
  FUEL_EDIT = 'fuel:edit',
  FUEL_DELETE = 'fuel:delete',

  // ── Maintenance ──
  MAINTENANCE_VIEW = 'maintenance:view',
  MAINTENANCE_CREATE = 'maintenance:create',
  MAINTENANCE_EDIT = 'maintenance:edit',
  MAINTENANCE_DELETE = 'maintenance:delete',
  MAINTENANCE_COMPLETE = 'maintenance:complete',

  // ── Trip ──
  TRIP_VIEW = 'trip:view',
  TRIP_CREATE = 'trip:create',
  TRIP_EDIT = 'trip:edit',
  TRIP_DELETE = 'trip:delete',

  // ── Analytics ──
  ANALYTICS_VIEW = 'analytics:view',
  ANALYTICS_EXPORT = 'analytics:export',

  // ── Reports ──
  REPORT_VIEW = 'report:view',
  REPORT_CREATE = 'report:create',
  REPORT_DELETE = 'report:delete',
  REPORT_SCHEDULE = 'report:schedule',

  // ── Users ──
  USER_VIEW = 'user:view',
  USER_CREATE = 'user:create',
  USER_EDIT = 'user:edit',
  USER_DELETE = 'user:delete',

  // ── Driver-specific ──
  DRIVER_ASSIGN = 'driver:assign',
  DRIVER_VIEW_TRIPS = 'driver:view:trips',

  // ── Mechanic-specific ──
  MECHANIC_VIEW_MAINTENANCE = 'mechanic:view:maintenance',
  MECHANIC_UPDATE_STATUS = 'mechanic:update:status',

  // ── FleetOps – Dispatch ──
  DISPATCH_VIEW = 'dispatch:view',
  DISPATCH_CREATE = 'dispatch:create',
  DISPATCH_ASSIGN = 'dispatch:assign',
  DISPATCH_MANAGE = 'dispatch:manage',

  // ── FleetOps – Schedule / Shifts ──
  SCHEDULE_SHIFT_VIEW = 'schedule_shift:view',
  SCHEDULE_SHIFT_MANAGE = 'schedule_shift:manage',

  // ── FleetOps – Booking ──
  BOOKING_VIEW = 'booking:view',
  BOOKING_CREATE = 'booking:create',
  BOOKING_APPROVE = 'booking:approve',
  BOOKING_MANAGE = 'booking:manage',

  // ── FleetOps – Work Orders ──
  WORKORDER_VIEW = 'workorder:view',
  WORKORDER_CREATE = 'workorder:create',
  WORKORDER_ASSIGN = 'workorder:assign',
  WORKORDER_COMPLETE = 'workorder:complete',
  WORKORDER_MANAGE = 'workorder:manage',

  // ── FleetOps – Workshop ──
  WORKSHOP_VIEW = 'workshop:view',
  WORKSHOP_MANAGE = 'workshop:manage',

  // ── FleetOps – Inventory / Spare Parts ──
  INVENTORY_VIEW = 'inventory:view',
  INVENTORY_MANAGE = 'inventory:manage',
  INVENTORY_ADJUST = 'inventory:adjust',

  // ── FleetOps – Procurement ──
  PROCUREMENT_VIEW = 'procurement:view',
  PROCUREMENT_REQUEST = 'procurement:request',
  PROCUREMENT_APPROVE = 'procurement:approve',
  PROCUREMENT_MANAGE = 'procurement:manage',

  // ── FleetOps – Vendor ──
  VENDOR_VIEW = 'vendor:view',
  VENDOR_MANAGE = 'vendor:manage',

  // ── FleetOps – SLA ──
  SLA_VIEW = 'sla:view',
  SLA_MANAGE = 'sla:manage',

  // ── FleetOps – Compliance ──
  COMPLIANCE_VIEW = 'compliance:view',
  COMPLIANCE_MANAGE = 'compliance:manage',

  // ── Security / Permission Engine (Slice 6a) ──
  CUSTOM_ROLE_VIEW = 'custom_role:view',
  CUSTOM_ROLE_MANAGE = 'custom_role:manage',
  ORG_UNIT_VIEW = 'org_unit:view',
  ORG_UNIT_MANAGE = 'org_unit:manage',
  RESOURCE_PERMISSION_VIEW = 'resource_permission:view',
  RESOURCE_PERMISSION_MANAGE = 'resource_permission:manage',
  SCOPE_ASSIGNMENT_VIEW = 'scope_assignment:view',
  SCOPE_ASSIGNMENT_MANAGE = 'scope_assignment:manage',

  // ── Session Management & API Keys (Slice 6b) ──
  SESSION_VIEW = 'session:view',
  SESSION_MANAGE = 'session:manage',
  API_KEY_VIEW = 'api_key:view',
  API_KEY_MANAGE = 'api_key:manage',

  // ── Immutable Audit Trail & Threat Detection (Slice 6c) ──
  AUDIT_LOG_VIEW = 'audit_log:view',
  AUDIT_LOG_VERIFY = 'audit_log:verify',
  SECURITY_EVENT_VIEW = 'security_event:view',
  ACCOUNT_LOCKOUT_MANAGE = 'account_lockout:manage',

  // ── MFA & SSO (Slice 6d) ──
  MFA_MANAGE = 'mfa:manage',
  SSO_CONNECTION_VIEW = 'sso_connection:view',
  SSO_CONNECTION_MANAGE = 'sso_connection:manage',

  // ── Phase 7 — True Multi-Tenancy / Platform Management ──
  PLATFORM_VIEW = 'platform:view',
  PLATFORM_MANAGE = 'platform:manage',
  ORG_UNIT_MOVE = 'org_unit:move',

  // ── Jobs & Schedules (Platform Operations) ──
  JOB_VIEW = 'job:view',
  JOB_MANAGE = 'job:manage',
  SCHEDULE_VIEW = 'schedule:view',
  SCHEDULE_MANAGE = 'schedule:manage',

  // ── Plugins / Integrations (Phase 10a) ──
  PLUGIN_VIEW = 'plugin:view',
  PLUGIN_MANAGE = 'plugin:manage',
  PLUGIN_REGISTER = 'plugin:register',

  // ── Webhooks / Event Subscriptions (Phase 10b) ──
  WEBHOOK_VIEW = 'webhook:view',
  WEBHOOK_MANAGE = 'webhook:manage',

  // ── OAuth Clients (Slice 10d) ──
  OAUTH_CLIENT_VIEW = 'oauth:client:view',
  OAUTH_CLIENT_MANAGE = 'oauth:client:manage',

  // ── External Providers ──
  EXTERNAL_PROVIDER_VIEW = 'external:provider:view',
  EXTERNAL_PROVIDER_MANAGE = 'external:provider:manage',
}

/**
 * Permissions that are restricted to SUPER_ADMIN only.
 * ORGANIZATION_OWNER (and all other roles) must NOT have these.
 */
const PLATFORM_ONLY_PERMISSIONS: Permission[] = [
  Permission.PLATFORM_VIEW,
  Permission.PLATFORM_MANAGE,
  Permission.PLUGIN_REGISTER,
];

export const rolePermissions: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: Object.values(Permission),

  [Role.ORGANIZATION_OWNER]: Object.values(Permission).filter(
    (p) => !PLATFORM_ONLY_PERMISSIONS.includes(p)
  ),

  [Role.FLEET_MANAGER]: [
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
    // FleetOps – Dispatch
    Permission.DISPATCH_VIEW,
    Permission.DISPATCH_CREATE,
    Permission.DISPATCH_ASSIGN,
    Permission.DISPATCH_MANAGE,
    // FleetOps – Schedule / Shifts
    Permission.SCHEDULE_SHIFT_VIEW,
    Permission.SCHEDULE_SHIFT_MANAGE,
    // FleetOps – Booking
    Permission.BOOKING_VIEW,
    Permission.BOOKING_CREATE,
    Permission.BOOKING_APPROVE,
    Permission.BOOKING_MANAGE,
    // FleetOps – Work Orders
    Permission.WORKORDER_VIEW,
    Permission.WORKORDER_CREATE,
    Permission.WORKORDER_ASSIGN,
    Permission.WORKORDER_COMPLETE,
    Permission.WORKORDER_MANAGE,
    // FleetOps – Workshop
    Permission.WORKSHOP_VIEW,
    Permission.WORKSHOP_MANAGE,
    // FleetOps – Inventory
    Permission.INVENTORY_VIEW,
    // FleetOps – Procurement
    Permission.PROCUREMENT_VIEW,
    Permission.PROCUREMENT_REQUEST,
    // FleetOps – Vendor
    Permission.VENDOR_VIEW,
    // FleetOps – SLA & Compliance
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
  ],

  [Role.ACCOUNTANT]: [
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
    // FleetOps – Procurement (approve only)
    Permission.PROCUREMENT_VIEW,
    Permission.PROCUREMENT_APPROVE,
    // FleetOps – Vendor
    Permission.VENDOR_VIEW,
  ],

  [Role.DISPATCHER]: [
    Permission.ORG_VIEW,
    Permission.VEHICLE_VIEW,
    Permission.TRIP_VIEW,
    Permission.TRIP_CREATE,
    Permission.TRIP_EDIT,
    Permission.MAINTENANCE_VIEW,
    Permission.DRIVER_ASSIGN,
    Permission.DRIVER_VIEW_TRIPS,
    // FleetOps – Dispatch
    Permission.DISPATCH_VIEW,
    Permission.DISPATCH_CREATE,
    Permission.DISPATCH_ASSIGN,
    // FleetOps – Schedule / Shifts
    Permission.SCHEDULE_SHIFT_VIEW,
    // FleetOps – Booking
    Permission.BOOKING_VIEW,
  ],

  [Role.DRIVER]: [
    Permission.VEHICLE_VIEW,
    Permission.FUEL_CREATE,
    Permission.TRIP_CREATE,
    Permission.MAINTENANCE_VIEW,
    Permission.DRIVER_VIEW_TRIPS,
    // FleetOps – Booking
    Permission.BOOKING_CREATE,
    Permission.BOOKING_VIEW,
    // FleetOps – Schedule / Shifts
    Permission.SCHEDULE_SHIFT_VIEW,
  ],

  [Role.MECHANIC]: [
    Permission.ORG_VIEW,
    Permission.VEHICLE_VIEW,
    Permission.MAINTENANCE_VIEW,
    Permission.MAINTENANCE_EDIT,
    Permission.MAINTENANCE_COMPLETE,
    Permission.MECHANIC_VIEW_MAINTENANCE,
    Permission.MECHANIC_UPDATE_STATUS,
    // FleetOps – Work Orders
    Permission.WORKORDER_VIEW,
    Permission.WORKORDER_COMPLETE,
    // FleetOps – Workshop
    Permission.WORKSHOP_VIEW,
    // FleetOps – Inventory
    Permission.INVENTORY_VIEW,
    Permission.INVENTORY_ADJUST,
  ],

  [Role.AUDITOR]: [
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
    // FleetOps – Compliance, SLA, Vendor, Procurement
    Permission.COMPLIANCE_VIEW,
    Permission.SLA_VIEW,
    Permission.VENDOR_VIEW,
    Permission.PROCUREMENT_VIEW,
  ],

  [Role.VIEWER]: [
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