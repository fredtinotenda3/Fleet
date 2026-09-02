// frontend/modules/platform-admin/pages/OrganizationDetailPage.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Info, Network, Plus, RefreshCw } from 'lucide-react';

import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { Permission, permissionService } from '@/server/permissions/roles';
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

import { useCreateOrgUnit, useOrgUnitsForTenant, usePlatformOrganization } from '../hooks';
import { OrgUnitTable } from '../components/OrgUnitTable';
import { OrgUnitForm } from '../components/OrgUnitForm';
import { PLATFORM_ADMIN_ROUTES } from '../routes';
import {
  canManageOrgUnitsFor,
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
 * One organization, plus its branches where the API can answer for them.
 *
 * READ THE ORG-UNIT SECTION BELOW BEFORE CHANGING IT. `/api/tenancy/
 * org-units` derives `organizationId` from the CALLER'S SESSION on both
 * GET and POST -- `OrgUnitController.listOrgUnits` passes
 * `organizationId: tenantId`, and the create path spreads
 * `{ ...parsed.data, organizationId: tenantId }` with the session's
 * tenant LAST, so a body naming another organization is overridden
 * rather than honoured.
 *
 * So there is no way to list or create branches for a tenant other than
 * the caller's own. Rendering the list anyway would show a platform
 * admin THEIR OWN branches under someone else's organization name, and
 * "Add branch" there would create it in their own tenant -- with every
 * request returning 200. That is the worst available outcome: wrong
 * data that looks right and a write that lands somewhere else.
 *
 * `canManageOrgUnitsFor` therefore gates the whole section, and the
 * unavailable case explains itself instead of showing an empty table.
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
  const orgUnitsAvailable = canManageOrgUnitsFor(organization, sessionTenantId);

  const orgUnits = useOrgUnitsForTenant(sessionTenantId ?? '', {
    enabled: hasAccess && orgUnitsAvailable,
  });
  const createOrgUnit = useCreateOrgUnit(sessionTenantId ?? '');

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
      <Link
        href={PLATFORM_ADMIN_ROUTES.organizations}
        className="inline-flex items-center gap-1 text-body-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        All organizations
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-h1">{organization.name}</h1>
            <Badge variant={presentation.badgeVariant} className="gap-1">
              <span
                className={`inline-block h-2 w-2 rounded-full ${presentation.dotClassName}`}
                aria-hidden="true"
              />
              {organizationStatusLabel(organization.status)}
            </Badge>
          </div>
          {tenant && <code className="mt-1 block text-body-sm text-muted-foreground">{tenant}</code>}
        </div>
        <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw
            className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          Refresh
        </Button>
      </div>

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

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Branches and units</CardTitle>
          {orgUnitsAvailable && canManageUnits && (
            <Button type="button" size="sm" onClick={() => setCreateUnitOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Add unit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!orgUnitsAvailable ? (
            /*
              The honest answer, not an empty table. See this component's
              header: the org-unit endpoints answer only for the caller's
              own tenant, so showing anything here would be showing the
              wrong organization's branches.
            */
            <Alert>
              <Info className="size-4" aria-hidden="true" />
              <AlertTitle>Branches aren&apos;t available for this organization</AlertTitle>
              <AlertDescription>
                The org-unit API resolves the organization from the signed-in session, so it can
                only list or create branches for your own organization
                {sessionTenantId ? ` (${sessionTenantId})` : ''}. Managing another tenant&apos;s
                branches from here needs a platform-scoped org-unit endpoint, which does not exist
                yet.
              </AlertDescription>
            </Alert>
          ) : orgUnits.isLoading ? (
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

      {orgUnitsAvailable && canManageUnits && (
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
