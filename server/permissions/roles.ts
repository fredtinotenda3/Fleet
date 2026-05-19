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
  // Organization permissions
  ORG_VIEW = 'org:view',
  ORG_MANAGE = 'org:manage',
  ORG_SETTINGS = 'org:settings',
  ORG_MEMBERS_MANAGE = 'org:members:manage',
  
  // Vehicle permissions
  VEHICLE_VIEW = 'vehicle:view',
  VEHICLE_CREATE = 'vehicle:create',
  VEHICLE_EDIT = 'vehicle:edit',
  VEHICLE_DELETE = 'vehicle:delete',
  
  // Expense permissions
  EXPENSE_VIEW = 'expense:view',
  EXPENSE_CREATE = 'expense:create',
  EXPENSE_EDIT = 'expense:edit',
  EXPENSE_DELETE = 'expense:delete',
  EXPENSE_APPROVE = 'expense:approve',
  
  // Fuel permissions
  FUEL_VIEW = 'fuel:view',
  FUEL_CREATE = 'fuel:create',
  FUEL_EDIT = 'fuel:edit',
  FUEL_DELETE = 'fuel:delete',
  
  // Maintenance permissions
  MAINTENANCE_VIEW = 'maintenance:view',
  MAINTENANCE_CREATE = 'maintenance:create',
  MAINTENANCE_EDIT = 'maintenance:edit',
  MAINTENANCE_DELETE = 'maintenance:delete',
  MAINTENANCE_COMPLETE = 'maintenance:complete',
  
  // Trip permissions
  TRIP_VIEW = 'trip:view',
  TRIP_CREATE = 'trip:create',
  TRIP_EDIT = 'trip:edit',
  TRIP_DELETE = 'trip:delete',
  
  // Analytics permissions
  ANALYTICS_VIEW = 'analytics:view',
  ANALYTICS_EXPORT = 'analytics:export',
  
  // Report permissions
  REPORT_VIEW = 'report:view',
  REPORT_CREATE = 'report:create',
  REPORT_DELETE = 'report:delete',
  REPORT_SCHEDULE = 'report:schedule',
  
  // User permissions
  USER_VIEW = 'user:view',
  USER_CREATE = 'user:create',
  USER_EDIT = 'user:edit',
  USER_DELETE = 'user:delete',
  
  // Driver-specific
  DRIVER_ASSIGN = 'driver:assign',
  DRIVER_VIEW_TRIPS = 'driver:view:trips',
  
  // Mechanic-specific
  MECHANIC_VIEW_MAINTENANCE = 'mechanic:view:maintenance',
  MECHANIC_UPDATE_STATUS = 'mechanic:update:status',
}

export const rolePermissions: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: Object.values(Permission),
  
  [Role.ORGANIZATION_OWNER]: [
    Permission.ORG_VIEW, Permission.ORG_MANAGE, Permission.ORG_SETTINGS, Permission.ORG_MEMBERS_MANAGE,
    ...Object.values(Permission).filter(p => p !== Permission.ORG_MANAGE && p !== Permission.ORG_SETTINGS),
  ],
  
  [Role.FLEET_MANAGER]: [
    Permission.ORG_VIEW,
    Permission.VEHICLE_VIEW, Permission.VEHICLE_CREATE, Permission.VEHICLE_EDIT,
    Permission.MAINTENANCE_VIEW, Permission.MAINTENANCE_CREATE, Permission.MAINTENANCE_EDIT,
    Permission.TRIP_VIEW,
    Permission.ANALYTICS_VIEW,
    Permission.REPORT_VIEW,
    Permission.DRIVER_ASSIGN,
  ],
  
  [Role.ACCOUNTANT]: [
    Permission.ORG_VIEW,
    Permission.VEHICLE_VIEW,
    Permission.EXPENSE_VIEW, Permission.EXPENSE_CREATE, Permission.EXPENSE_EDIT, Permission.EXPENSE_APPROVE,
    Permission.FUEL_VIEW, Permission.FUEL_CREATE,
    Permission.ANALYTICS_VIEW, Permission.ANALYTICS_EXPORT,
    Permission.REPORT_VIEW, Permission.REPORT_CREATE,
  ],
  
  [Role.DISPATCHER]: [
    Permission.ORG_VIEW,
    Permission.VEHICLE_VIEW,
    Permission.TRIP_VIEW, Permission.TRIP_CREATE, Permission.TRIP_EDIT,
    Permission.MAINTENANCE_VIEW,
    Permission.DRIVER_ASSIGN, Permission.DRIVER_VIEW_TRIPS,
  ],
  
  [Role.DRIVER]: [
    Permission.VEHICLE_VIEW,
    Permission.FUEL_CREATE,
    Permission.TRIP_CREATE,
    Permission.MAINTENANCE_VIEW,
    Permission.DRIVER_VIEW_TRIPS,
  ],
  
  [Role.MECHANIC]: [
    Permission.ORG_VIEW,
    Permission.VEHICLE_VIEW,
    Permission.MAINTENANCE_VIEW, Permission.MAINTENANCE_EDIT, Permission.MAINTENANCE_COMPLETE,
    Permission.MECHANIC_VIEW_MAINTENANCE, Permission.MECHANIC_UPDATE_STATUS,
  ],
  
  [Role.AUDITOR]: [
    Permission.ORG_VIEW,
    Permission.VEHICLE_VIEW,
    Permission.EXPENSE_VIEW,
    Permission.FUEL_VIEW,
    Permission.TRIP_VIEW,
    Permission.ANALYTICS_VIEW, Permission.ANALYTICS_EXPORT,
    Permission.REPORT_VIEW,
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
      const role = userRole as Role;
      const permissions = rolePermissions[role];
      if (permissions?.includes(requiredPermission)) {
        return true;
      }
    }
    return false;
  }
  
  hasAnyPermission(userRoles: string[], requiredPermissions: Permission[]): boolean {
    return requiredPermissions.some(p => this.hasPermission(userRoles, p));
  }
  
  hasAllPermissions(userRoles: string[], requiredPermissions: Permission[]): boolean {
    return requiredPermissions.every(p => this.hasPermission(userRoles, p));
  }
  
  getPermissionsForRole(role: Role): Permission[] {
    return rolePermissions[role] || [];
  }
  
  getAllPermissions(): Permission[] {
    return Object.values(Permission);
  }
}

export const permissionService = new PermissionService();