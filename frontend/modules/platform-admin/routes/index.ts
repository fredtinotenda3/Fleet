// frontend/modules/platform-admin/routes/index.ts

export const PLATFORM_ADMIN_ROUTES = {
  organizations: '/platform-admin/organizations',
  organizationDetail: (id: string) =>
    `/platform-admin/organizations/${encodeURIComponent(id)}`,

  // Users, Roles & Permissions, API keys, Audit log.
  //
  // `apiKeys` and `auditLog` sit under /platform-admin because that is
  // where an administrator looks for them, NOT because the endpoints
  // behind them are platform-scoped -- neither is. API keys are
  // organization-scoped outright, and the audit log is cross-tenant
  // only for a super admin. Both pages state their own scope; see
  // PlatformApiKeysPage and PlatformAuditLogPage.
  users: '/platform-admin/users',
  rolesPermissions: '/platform-admin/roles',
  apiKeys: '/platform-admin/api-keys',
  auditLog: '/platform-admin/audit-log',
};
