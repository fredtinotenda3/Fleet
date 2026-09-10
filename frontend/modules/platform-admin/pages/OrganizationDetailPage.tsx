// frontend/modules/platform-admin/pages/OrganizationDetailPage.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Network, Plus, RefreshCw } from 'lucide-react';

import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { Permission, permissionService } from '@/server/permissions/roles';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '@/frontend/shared/ui/feedback/alert';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/frontend/shared/ui/data-display/card';

import {
  useCreateOrganizationOrgUnit,
  useOrganizationOrgUnits,
  usePlatformOrganization,
} from '../hooks';
import { OrgUnitTable } from '../components/OrgUnitTable';
import { OrgUnitForm } from '../components/OrgUnitForm';
import { OrganizationMembersSection } from '../components/OrganizationMembersSection';
import { PLATFORM_ADMIN_ROUTES } from '../routes';
import {
  formatDate,
  formatSeats,
  organizationStatusLabel,
  organizationStatusPresentation,
  organizationTierLabel,
  tenantIdentifier,
} from '../utils/platform-admin.utils';

interface OrganizationDetailPageProps {
  /** The route param -- a tenant slug or a Mongo _id; `resolveOrganization` accepts both. */
  organizationId: string;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-2 border-b border-border last:border-0">
      <dt className="text-body-sm text-muted-foreground">{label}</dt>
      <dd className="text-body-sm text-foreground">{children}</dd>
    </div>
  );
}

/**
 * One organization and its branch tree.
 *
 * ---------------------------------------------------------------
 * WHY THE ORG-UNIT SECTION USES THE PLATFORM ROUTES
 * ---------------------------------------------------------------
 * This section was gated off for three rounds, and the reason is worth
 * keeping: `/api/tenancy/org-units` derives `organizationId` from the
 * CALLER'S SESSION on both GET and POST -- the list passes
 * `organizationId: tenantId`, and the create spreads
 * `{ ...parsed.data, organizationId: tenantId }` with the session's
 * tenant LAST, so a body naming another organization is overridden
 * rather than honoured.
 *
 * Rendering that here would have shown a platform admin THEIR OWN
 * branches under someone else's organization name, and "Add unit" would
 * have created the unit in their own tenant -- with every request
 * returning 200. Wrong data that looks right, and a write that lands
 * somewhere else.
 *
 * `GET`/`POST /api/platform/organizations/:id/org-units` take the
 * organization from the PATH, resolve it to a real organization's slug,
 * and are guarded by PLATFORM_VIEW / PLATFORM_MANAGE plus the literal
 * SUPER_ADMIN. So this page now shows the branches that actually belong
 * to the customer named at the top of it.
 *
 * DO NOT swap these hooks back to `useOrgUnitsForTenant` /
 * `useCreateOrgUnit`: those still hit the session-scoped routes and are
 * correct only on the caller's own organization.
 */
export function OrganizationDetailPage({ organizationId }: OrganizationDetailPageProps) {
  const router = useRouter();
  const { user } = useAuth();

  const hasAccess = permissionService.hasPermission(user?.roles ?? [], Permission.PLATFORM_VIEW);
  const canManageUnits = permissionService.hasPermission(
    user?.roles ?? [],
    Permission.ORG_UNIT_MANAGE
  );

  const [createUnitOpen, setCreateUnitOpen] = useState(false);

  const {
    data: organization,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = usePlatformOrganization(organizationId, { enabled: hasAccess });

  const sessionTenantId = user?.tenantId ?? null;

  /**
   * Keyed by the ORGANIZATION being viewed, not by the session tenant.
   * `/api/platform/organizations/:id/org-units` takes the organization
   * from the path, so this page now shows the branches that actually
   * belong to the customer whose name is at the top of it.
   */
  const orgUnits = useOrganizationOrgUnits(organizationId, { enabled: hasAccess });
  const createOrgUnit = useCreateOrganizationOrgUnit(organizationId);

  if (!hasAccess) {
    return (
      <EmptyState
        title="You don't have access to this page"
        description="Platform administration spans every tenant and isn't available to organization roles."
        action={{ label: 'Back to dashboard', onClick: () => router.push('/dashboard') }}
      />
    );
  }

  if (isLoading) {
    return <PageLoader label="Loading organization" />;
  }

  if (isError || !organization) {
    return (
      <div className="p-4 space-y-6 sm:p-6">
        <Link
          href={PLATFORM_ADMIN_ROUTES.organizations}
          className="inline-flex items-center gap-1 text-body-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          All organizations
        </Link>
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Couldn&apos;t load this organization</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'An unexpected error occurred.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const presentation = organizationStatusPresentation(organization.status);
  const tenant = tenantIdentifier(organization);
  const units = orgUnits.data ?? [];

  return (
    <div className="p-4 space-y-6 sm:p-6">
      <PageHeader
        title={organization.name}
        description="Plan, seats, members, and branch structure for this tenant."
        backHref={PLATFORM_ADMIN_ROUTES.organizations}
        backLabel="All organizations"
        meta={
          <>
            <Badge variant={presentation.badgeVariant} className="gap-1">
              <span
                className={`inline-block h-2 w-2 rounded-full ${presentation.dotClassName}`}
                aria-hidden="true"
              />
              {organizationStatusLabel(organization.status)}
            </Badge>
            {tenant && <code className="text-body-sm text-muted-foreground">{tenant}</code>}
          </>
        }
        actions={
          <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw
              className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Refresh
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
        </CardHeader>
        <CardContent>
          <dl>
            <DetailRow label="Name">{organization.name}</DetailRow>
            <DetailRow label="Tenant ID">
              {tenant ? <code>{tenant}</code> : '—'}
            </DetailRow>
            <DetailRow label="Status">{organizationStatusLabel(organization.status)}</DetailRow>
            <DetailRow label="Plan">
              {organizationTierLabel(organization.subscription?.tier)}
            </DetailRow>
            <DetailRow label="Seats used">{formatSeats(organization.subscription)}</DetailRow>
            <DetailRow label="Members">{organization.members?.length ?? 0}</DetailRow>
            <DetailRow label="Created">
              {formatDate(organization.createdAt as unknown as string)}
            </DetailRow>
          </dl>
        </CardContent>
      </Card>

      {/*
        Members read cross-tenant (GET /api/platform/organizations/:id
        is a SUPER_ADMIN platform read) but WRITE only for the caller's
        own organization. The section decides that itself via
        canManageMembersFor() and explains the restriction in place --
        see its header for why the member routes are not trusted
        cross-tenant.
      */}
      <OrganizationMembersSection organization={organization} sessionTenantId={sessionTenantId} />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Branches and units</CardTitle>
          {canManageUnits && (
            <Button type="button" size="sm" onClick={() => setCreateUnitOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Add unit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {orgUnits.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : orgUnits.isError ? (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" aria-hidden="true" />
              <AlertTitle>Couldn&apos;t load branches</AlertTitle>
              <AlertDescription>
                {orgUnits.error instanceof Error
                  ? orgUnits.error.message
                  : 'An unexpected error occurred.'}
              </AlertDescription>
            </Alert>
          ) : units.length === 0 ? (
            <EmptyState
              icon={<Network className="size-8 text-muted-foreground" aria-hidden="true" />}
              title="No branches yet"
              description="Create a branch to start splitting this organization's fleet by location."
              {...(canManageUnits
                ? { action: { label: 'Add unit', onClick: () => setCreateUnitOpen(true) } }
                : {})}
            />
          ) : (
            <OrgUnitTable units={units} />
          )}
        </CardContent>
      </Card>

      {canManageUnits && (
        <OrgUnitForm
          open={createUnitOpen}
          onClose={() => setCreateUnitOpen(false)}
          onSubmit={(payload) => createOrgUnit.mutateAsync(payload)}
          units={units}
          isSubmitting={createOrgUnit.isPending}
        />
      )}
    </div>
  );
}
