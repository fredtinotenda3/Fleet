// app/(protected)/organizations/api-keys/page.tsx
//
// ---------------------------------------------------------------------
// WHY THIS ROUTE EXISTS
// ---------------------------------------------------------------------
// The API-key UI was only reachable at /platform-admin/api-keys, and the
// whole /platform-admin section is gated on Permission.PLATFORM_VIEW,
// which PLATFORM_ONLY_PERMISSIONS strips from every tenant-level role.
// So a tenant IT administrator holding API_KEY_MANAGE -- the permission
// the endpoints actually enforce -- had NO reachable route to their own
// organization's keys. The sidebar's "API Keys" entry pointed instead at
// /organizations/advanced?tab=plugins, a page that contains no API-key
// UI at all (and, until the fix alongside this one, ignored the tab
// parameter as well).
//
// The page itself needed no change: PlatformApiKeysPage is already
// tenant-scoped by construction -- ApiKeyController resolves the
// organization from the caller's session on every verb and there is no
// cross-tenant API-key endpoint anywhere in app/api -- and its own
// header says so at length. What was missing was a door a tenant admin
// could walk through.
//
// The /platform-admin/api-keys route is deliberately KEPT: it is where a
// platform operator expects to find it, it renders the same component,
// and removing a working URL that people may have bookmarked buys
// nothing. Both routes serve the caller's own organization, which is the
// only thing the controller can serve.
//
// Access control is unchanged and is enforced where it belongs: the
// component checks API_KEY_MANAGE itself, and every underlying route is
// wrapped in withAuth with its own permission. This shim adds a path,
// never a privilege.

import { PlatformApiKeysPage } from '@/frontend/modules/platform-admin/pages';

export default function Page() {
  return <PlatformApiKeysPage />;
}
