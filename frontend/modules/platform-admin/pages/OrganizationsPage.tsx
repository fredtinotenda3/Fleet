// frontend/modules/platform-admin/pages/OrganizationsPage.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Building2, Plus, RefreshCw } from 'lucide-react';

import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { Permission, permissionService } from '@/server/permissions/roles';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '@/frontend/shared/ui/feedback/alert';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Input } from '@/frontend/shared/ui/forms/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/frontend/shared/ui/data-display/card';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';
import { useDebounce } from 'use-debounce';

import {
  useCreateOrganization,
  usePlatformOrganizations,
  usePlatformStats,
} from '../hooks';
import { OrganizationTable } from '../components/OrganizationTable';
import { OrganizationForm } from '../components/OrganizationForm';

const PAGE_SIZE = 25;

/**
 * Cross-tenant organization list.
 *
 * Gated on Permission.PLATFORM_VIEW to match the route's own gate. That
 * check is a UI convenience -- it shows a clear message instead of a
 * failed fetch -- and is NOT the enforcement point: the API additionally
 * requires the literal Role.SUPER_ADMIN in
 * PlatformController.requirePlatformAdmin, precisely because
 * `isSuperAdmin` is also true for organization_owner. An
 * organization_owner who somehow held PLATFORM_VIEW would still get a
 * 403 from the server, which this page surfaces as an error rather than
 * pretending to have data.
 */
export function OrganizationsPage() {
  const router = useRouter();
  const { user } = useAuth();

  const hasAccess = permissionService.hasPermission(user?.roles ?? [], Permission.PLATFORM_VIEW);

  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const params = {
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch.trim() || undefined,
  };

  const { data, isLoading, isFetching, isError, error, refetch } = usePlatformOrganizations(params, {
    enabled: hasAccess,
  });
  const stats = usePlatformStats({ enabled: hasAccess });
  const createOrganization = useCreateOrganization();

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
    return <PageLoader label="Loading organizations" />;
  }

  const organizations = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="p-4 space-y-6 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-h1">Organizations</h1>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Every tenant on the platform.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Refresh
          </Button>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            New organization
          </Button>
        </div>
      </div>

      <StatisticCards>
        {/*
          Only the three counters GET /api/platform/stats actually
          returns. No vehicle or user totals here -- that endpoint does
          not compute them and this page will not imply otherwise.
        */}
        <StatisticCard
          title="Organizations"
          value={stats.isLoading ? <Skeleton className="h-7 w-12" /> : (stats.data?.totalOrganizations ?? '—')}
        />
        <StatisticCard
          title="Active"
          value={stats.isLoading ? <Skeleton className="h-7 w-12" /> : (stats.data?.activeOrganizations ?? '—')}
        />
        <StatisticCard
          title="Suspended or archived"
          value={
            stats.isLoading ? <Skeleton className="h-7 w-12" /> : (stats.data?.suspendedOrganizations ?? '—')
          }
          description="Everything not currently active"
        />
      </StatisticCards>

      {stats.isError && (
        <Alert>
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Platform counters unavailable</AlertTitle>
          <AlertDescription>
            The organization list below is unaffected.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="gap-3">
          <CardTitle>All organizations</CardTitle>
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              // Any new search starts at page 1; keeping the old page
              // would show an empty result set for a narrower filter.
              setPage(1);
            }}
            placeholder="Search by name or tenant ID"
            className="max-w-sm"
            aria-label="Search organizations"
          />
        </CardHeader>
        <CardContent>
          {isError ? (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" aria-hidden="true" />
              <AlertTitle>Couldn&apos;t load organizations</AlertTitle>
              <AlertDescription>
                {error instanceof Error ? error.message : 'An unexpected error occurred.'}
              </AlertDescription>
            </Alert>
          ) : organizations.length === 0 ? (
            <EmptyState
              icon={<Building2 className="size-8 text-muted-foreground" aria-hidden="true" />}
              title={debouncedSearch ? 'No organizations match that search' : 'No organizations yet'}
              description={
                debouncedSearch
                  ? 'Try a different name or tenant ID.'
                  : 'Create the first organization to get started.'
              }
              {...(debouncedSearch
                ? {}
                : { action: { label: 'New organization', onClick: () => setCreateOpen(true) } })}
            />
          ) : (
            <>
              <OrganizationTable organizations={organizations} />

              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-body-sm text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={!pagination.hasPrev || isFetching}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={!pagination.hasNext || isFetching}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <OrganizationForm
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(payload) => createOrganization.mutateAsync(payload)}
        isSubmitting={createOrganization.isPending}
      />
    </div>
  );
}
