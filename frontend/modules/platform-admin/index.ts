// frontend/modules/platform-admin/index.ts
//
// Platform Admin -- cross-tenant organization and branch administration.
// Same layout as frontend/modules/observability: types / services /
// hooks / utils / components / pages / routes.
//
// See ./types for the endpoint map and the tenant-scoping constraint on
// the org-unit routes, and PLATFORM_ADMIN_NOTES.md for what is not
// buildable against today's backend.

export * from './types';
export { platformAdminApi } from './services/platform-admin.api';
export { platformAccessApi, AUDIT_LOG_MAX_LIMIT } from './services/platform-access.api';
export * from './hooks';
export * from './utils/platform-admin.utils';
export * from './utils/platform-access.utils';
export * from './components';
export * from './pages';
export { PLATFORM_ADMIN_ROUTES } from './routes';
