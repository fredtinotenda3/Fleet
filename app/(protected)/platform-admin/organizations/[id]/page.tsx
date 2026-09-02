// app/(protected)/platform-admin/organizations/[id]/page.tsx
//
// Route shim for the Platform Admin organization detail view.
//
// `params` is a Promise in Next 15, matching every other dynamic route
// in this app (see app/api/organizations/[id]/route.ts). The id may be
// a tenant slug or a Mongo _id -- PlatformService.getOrganization
// resolves through resolveOrganization, which accepts either.

import { OrganizationDetailPage } from '@/frontend/modules/platform-admin/pages';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <OrganizationDetailPage organizationId={decodeURIComponent(id)} />;
}
