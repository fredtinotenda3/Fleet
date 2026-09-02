// frontend/modules/platform-admin/routes/index.ts

export const PLATFORM_ADMIN_ROUTES = {
  organizations: '/platform-admin/organizations',
  organizationDetail: (id: string) =>
    `/platform-admin/organizations/${encodeURIComponent(id)}`,
};
