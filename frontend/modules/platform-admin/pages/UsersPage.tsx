// frontend/modules/platform-admin/pages/UsersPage.tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Info, RefreshCw, Search, Users } from 'lucide-react';
import { useDebounce } from 'use-debounce';

import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { Permission, permissionService } from '@/server/permissions/roles';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '@/frontend/shared/ui/feedback/alert';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';

import { usePlatformOrganizations } from '../hooks';
import { UserDirectoryTable } from '../components/UserDirectoryTable';
import {
  applyDirectoryFilters,
  buildUserDirectory,
  filterDirectory,
  roleLabel,
  sortDirectory,
  summariseDirectory,
} from '../utils/platform-access.utils';
import type { DirectoryUserStatus } from '../types';

/**
 * How many organizations to read per page.
 *
 * This is the directory's real granularity: users are DERIVED from the
 * organizations on the current page (see below), so this number sets
 * how much of the platform the directory covers at once. Larger than
 * the Organizations page's 25 because each row here is a person, not a
 * tenant, and a 25-organization page can easily hold fewer than 25
 * people worth scrolling. Not unbounded: the response carries every
 * organization document in full, members and invites included.
 */
const ORGANIZATIONS_PER_PAGE = 50;

/**
 * Platform users.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHERE THIS DATA COMES FROM, AND WHY IT IS DERIVED
 * ─────────────────────────────────────────────────────────────────────
 * There is no platform user endpoint. No /api/users, no
 * /api/platform/users, no cross-tenant user search anywhere in app/api.
 *
 * What exists is GET /api/platform/organizations, which returns FULL
 * Organization documents -- `PlatformService.listOrganizations` passes
 * no projection to `organizationRepository.findWithPagination` -- and
 * `Organization` embeds `members: OrganizationMember[]` and
 * `invites?: OrganizationInvite[]`. So the directory is built from the
 * one response the Organizations page already makes, with NO
 * per-organization fan-out.
 *
 * The consequence is stated on the page rather than hidden: the
 * directory covers the organizations on the current page, and says so
 * whenever more exist. A user directory that silently omits people is
 * worse than one that admits its own boundary -- an operator who
 * searches for someone and finds nothing needs to know whether that
 * means "not on the platform" or "not on this page".
 *
 * (`/api/admin` used to also return rows of the legacy `tbladmin`
 * collection, gated on `requireAuth()` alone with no Permission check,
 * no tenant scoping, and a bare-array response. It has been REMOVED --
 * see PLATFORM_ADMIN_BACKEND_GAPS.md, Gap 3 -- since nothing in the
 * product called it. This directory was never built on it.)
 *
 * ─────────────────────────────────────────────────────────────────────
 * NO ACTIONS HERE
 * ─────────────────────────────────────────────────────────────────────
 * Member writes live on the organization detail page, where the viewed
 * organization can be compared against the caller's own tenant. Rows
 * here span every organization on the page, so an action column would
 * have to operate on tenants the caller does not own. See
 * `canManageMembersFor()` and constraint 3 in ../types/access.types.ts.
 */
export function UsersPage() {
  const router = useRouter();
  const { user } = useAuth();

  const hasAccess = permissionService.hasPermission(user?.roles ?? [], Permission.PLATFORM_VIEW);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const [status, setStatus] = useState<DirectoryUserStatus | 'all'>('all');
  const [role, setRole] = useState<string>('all');
  const [organizationId, setOrganizationId] = useState<string>('all');

  const { data, isLoading, isFetching, isError, error, refetch } = usePlatformOrganizations(
    { page, limit: ORGANIZATIONS_PER_PAGE },
    { enabled: hasAccess }
  );

  const directory = useMemo(
    () => buildUserDirectory(data?.data, { hasNextPage: data?.pagination?.hasNext }),
    [data]
  );

  // Sorted once, then filtered -- the filters preserve order, so
  // re-sorting after each keystroke would be wasted work.
  const sorted = useMemo(() => sortDirectory(directory.users), [directory.users]);

  const visible = useMemo(
    () =>
      applyDirectoryFilters(filterDirectory(sorted, debouncedSearch), {
        status,
        role,
        organizationId,
      }),
    [sorted, debouncedSearch, status, role, organizationId]
  );

  const summary = useMemo(() => summariseDirectory(sorted), [sorted]);

  /** Roles actually present in the directory, so the filter never offers an empty result. */
  const roleOptions = useMemo(() => {
    const present = new Set(sorted.map((entry) => entry.role).filter(Boolean));
    return Array.from(present)
      .map((value) => ({ value, label: roleLabel(value) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [sorted]);

  const organizationOptions = useMemo(
    () =>
      (data?.data ?? [])
        .map((org) => ({ value: String(org._id ?? ''), label: org.name ?? 'Unnamed organization' }))
        .filter((option) => option.value)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data]
  );

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
    return <PageLoader label="Loading users" />;
  }

  const pagination = data?.pagination;

  return (
    <div className="p-4 space-y-6 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-h1">Users</h1>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Members and pending invitations across tenant organizations.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw
            className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          Refresh
        </Button>
      </div>

      {isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Couldn&apos;t load users</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'An unexpected error occurred.'}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <StatisticCards>
            <StatisticCard title="People" value={summary.total} description="Members and invites" />
            <StatisticCard title="Active" value={summary.active} />
            <StatisticCard title="Invited" value={summary.invited} />
            <StatisticCard title="Suspended" value={summary.suspended} />
          </StatisticCards>

          {/*
            The scope statement. Rendered whenever the platform holds
            more organizations than this page covers -- `partial` is
            taken from the listing's own `pagination.hasNext`, never
            guessed. Without it, an operator searching for someone in an
            organization on page 2 sees "no users match" and has no way
            to tell that from "this person does not exist".
          */}
          {directory.partial && (
            <Alert>
              <Info className="size-4" aria-hidden="true" />
              <AlertTitle>This is a partial directory</AlertTitle>
              <AlertDescription>
                There is no platform-wide user endpoint, so this list is built from the{' '}
                {directory.organizationsScanned} organizations on this page — of{' '}
                {pagination?.total ?? 'more'} in total. Page through to reach the rest, or open an
                organization directly.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
              <CardTitle>
                {visible.length === sorted.length
                  ? `${sorted.length} ${sorted.length === 1 ? 'person' : 'people'}`
                  : `${visible.length} of ${sorted.length}`}
              </CardTitle>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search
                    className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name, email or organization"
                    className="w-64 pl-7"
                    aria-label="Search users"
                  />
                </div>

                <Select
                  value={status}
                  onValueChange={(next) =>
                    setStatus(((next as string | null) ?? 'all') as DirectoryUserStatus | 'all')
                  }
                >
                  <SelectTrigger className="w-36" aria-label="Filter by status">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="invited">Invited</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={role}
                  onValueChange={(next) => setRole(((next as string | null) ?? 'all'))}
                >
                  <SelectTrigger className="w-44" aria-label="Filter by role">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    {roleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={organizationId}
                  onValueChange={(next) => setOrganizationId(((next as string | null) ?? 'all'))}
                >
                  <SelectTrigger className="w-52" aria-label="Filter by organization">
                    <SelectValue placeholder="Organization" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All organizations</SelectItem>
                    {organizationOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent>
              {isFetching && !isLoading ? (
                <div className="mb-2">
                  <Skeleton className="h-1 w-full" />
                </div>
              ) : null}

              {visible.length === 0 ? (
                <EmptyState
                  icon={<Users className="size-8 text-muted-foreground" aria-hidden="true" />}
                  title={sorted.length === 0 ? 'No users on this page' : 'No users match'}
                  description={
                    sorted.length === 0
                      ? 'The organizations on this page have no members or pending invitations.'
                      : 'Adjust the search or filters to widen the results.'
                  }
                />
              ) : (
                <UserDirectoryTable users={visible} />
              )}
            </CardContent>
          </Card>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-body-sm text-muted-foreground">
                Organizations {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={!pagination.hasPrev || isFetching}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!pagination.hasNext || isFetching}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
