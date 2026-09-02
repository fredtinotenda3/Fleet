// app/(protected)/platform-admin/api-keys/page.tsx
//
// Route shim for API keys. Rendering and data fetching live in
// frontend/modules/platform-admin.
//
// NOT PLATFORM-SCOPED despite the URL: ApiKeyController resolves the
// organization from the caller's session on every verb, so this manages
// the signed-in admin's own organization's keys. The page states that
// in a banner. See PlatformApiKeysPage.

import { PlatformApiKeysPage } from '@/frontend/modules/platform-admin/pages';

export default function Page() {
  return <PlatformApiKeysPage />;
}
