// infrastructure/security/permissions.ts

export enum Permission {
  // Vehicle permissions
  VEHICLE_READ = 'vehicle:read',
  VEHICLE_CREATE = 'vehicle:create',
  VEHICLE_UPDATE = 'vehicle:update',
  VEHICLE_DELETE = 'vehicle:delete',
  
  // Expense permissions
  EXPENSE_READ = 'expense:read',
  EXPENSE_CREATE = 'expense:create',
  EXPENSE_UPDATE = 'expense:update',
  EXPENSE_DELETE = 'expense:delete',
  
  // Fuel permissions
  FUEL_READ = 'fuel:read',
  FUEL_CREATE = 'fuel:create',
  FUEL_UPDATE = 'fuel:update',
  FUEL_DELETE = 'fuel:delete',
  
  // Maintenance permissions
  MAINTENANCE_READ = 'maintenance:read',
  MAINTENANCE_CREATE = 'maintenance:create',
  MAINTENANCE_UPDATE = 'maintenance:update',
  MAINTENANCE_DELETE = 'maintenance:delete',
  
  // Trip permissions
  TRIP_READ = 'trip:read',
  TRIP_CREATE = 'trip:create',
  TRIP_UPDATE = 'trip:update',
  TRIP_DELETE = 'trip:delete',
  
  // Analytics permissions
  ANALYTICS_READ = 'analytics:read',
  ANALYTICS_EXPORT = 'analytics:export',
  
  // Report permissions
  REPORT_READ = 'report:read',
  REPORT_CREATE = 'report:create',
  REPORT_DELETE = 'report:delete',
  
  // User permissions
  USER_READ = 'user:read',
  USER_CREATE = 'user:create',
  USER_UPDATE = 'user:update',
  USER_DELETE = 'user:delete',
  
  // Admin permissions
  ADMIN_ACCESS = 'admin:access',
  TENANT_MANAGE = 'tenant:manage',
}

export enum Role {
  SUPER_ADMIN = 'super_admin',
  FLEET_MANAGER = 'fleet_manager',
  ACCOUNTANT = 'accountant',
  DISPATCHER = 'dispatcher',
  DRIVER = 'driver',
  MECHANIC = 'mechanic',
  AUDITOR = 'auditor',
}

export const rolePermissions: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: Object.values(Permission),
  
  [Role.FLEET_MANAGER]: [
    Permission.VEHICLE_READ, Permission.VEHICLE_CREATE, Permission.VEHICLE_UPDATE,
    Permission.MAINTENANCE_READ, Permission.MAINTENANCE_CREATE, Permission.MAINTENANCE_UPDATE,
    Permission.TRIP_READ, Permission.TRIP_CREATE,
    Permission.ANALYTICS_READ,
    Permission.REPORT_READ, Permission.REPORT_CREATE,
  ],
  
  [Role.ACCOUNTANT]: [
    Permission.EXPENSE_READ, Permission.EXPENSE_CREATE, Permission.EXPENSE_UPDATE,
    Permission.FUEL_READ, Permission.FUEL_CREATE,
    Permission.ANALYTICS_READ,
    Permission.REPORT_READ, Permission.REPORT_CREATE,
  ],
  
  [Role.DISPATCHER]: [
    Permission.VEHICLE_READ,
    Permission.TRIP_READ, Permission.TRIP_CREATE, Permission.TRIP_UPDATE,
    Permission.MAINTENANCE_READ,
  ],
  
  [Role.DRIVER]: [
    Permission.VEHICLE_READ,
    Permission.FUEL_CREATE,
    Permission.TRIP_CREATE,
    Permission.MAINTENANCE_READ,
  ],
  
  [Role.MECHANIC]: [
    Permission.VEHICLE_READ,
    Permission.MAINTENANCE_READ, Permission.MAINTENANCE_CREATE, Permission.MAINTENANCE_UPDATE,
  ],
  
  [Role.AUDITOR]: [
    Permission.EXPENSE_READ,
    Permission.FUEL_READ,
    Permission.TRIP_READ,
    Permission.ANALYTICS_READ,
    Permission.REPORT_READ,
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
    return requiredPermissions.some(permission => this.hasPermission(userRoles, permission));
  }
  
  hasAllPermissions(userRoles: string[], requiredPermissions: Permission[]): boolean {
    return requiredPermissions.every(permission => this.hasPermission(userRoles, permission));
  }
  
  filterByPermission<T extends { _id: string }>(
    items: T[],
    userRoles: string[],
    requiredPermission: Permission
  ): T[] {
    if (this.hasPermission(userRoles, requiredPermission)) {
      return items;
    }
    // Return empty or filtered based on ownership
    return [];
  }
}

export const permissionService = new PermissionService();