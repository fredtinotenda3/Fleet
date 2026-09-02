// frontend/modules/platform-admin/pages/RolesPermissionsPage.tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Info, RefreshCw, Search, ShieldCheck } from 'lucide-react';

import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { Permission, permissionService } from '@/server/permissions/roles';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '@/frontend/shared/ui/feedback/alert';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/shared/ui/data-display/card';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';

import { useCustomRoles, usePermissionDefinitions } from '../hooks';
import { RoleMatrixTable } from '../components/RoleMatrixTable';
import { CustomRoleTable } from '../components/CustomRoleTable';
import {
  buildStaticRoleDefinitions,
  groupPermissionsByCategory,
  mergePermissionCatalogue,
} from '../utils/platform-access.utils';

/**
 * Roles & Permissions.
 *
 * THREE SOURCES, THREE DIFFERENT KINDS OF THING, kept visibly apart
 * because conflating them is how an operator ends up believing a role
 * grants something it does not:
 *
 *  1. BUILT-IN ROLES -- `rolePermissions` in server/permissions/roles.ts.
 *     Read from source, not over the wire: there is no endpoint for the
 *     static matrix (GET /api/security/roles returns CUSTOM roles
 *     only), and this module is already imported by the frontend for
 *     `permissionService`. Reading it directly means what is rendered
 *     is exactly what the server enforces, with no drift possible.
 *
 *  2. CUSTOM ROLES -- GET /api/security/roles. TENANT-SCOPED to the
 *     caller: `RoleController.listRoles` resolves the tenant from the
 *     session, so even a platform admin sees only their own
 *     organization's roles here. The card says so rather than implying
 *     a platform-wide list.
 *
 *  3. THE PERMISSION CATALOGUE -- GET /api/security/permissions. The
 *     PermissionRegistry's display metadata. NOT a superset of the
 *     static enum: a Permission that was never registered is simply
 *     absent from it, which is why the catalogue is merged with the
 *     enum rather than trusted alone (see mergePermissionCatalogue).
 *
 * ASSIGNMENT lives on the organization detail page, where the viewed
 * organization can be compared against the caller's own tenant -- the
 * member endpoint takes an organization id from the URL that nothing
 * binds to the caller. See constraint 3 in ../types/access.types.ts.
 */
export function RolesPermissionsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const roles = user?.roles ?? [];

  const hasPlatformAccess = permissionService.hasPermission(roles, Permission.PLATFORM_VIEW);
  const canViewCustomRoles = permissionService.hasPermission(roles, Permission.CUSTOM_ROLE_VIEW);

  const [permissionFilter, setPermissionFilter] = useState('');

  const customRoles = useCustomRoles({ activeOnly: false, enabled: hasPlatformAccess });
  const catalogue = usePermissionDefinitions({ enabled: hasPlatformAccess });

  const staticRoles = useMemo(() => buildStaticRoleDefinitions(), []);

  const mergedPermissions = useMemo(
    () => mergePermissionCatalogue(catalogue.data),
    [catalogue.data]
  );

  /** Registry labels by key, so both tables can render a human label with one lookup. */
  const permissionLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const definition of mergedPermissions) labels[definition.key] = definition.label;
    return labels;
  }, [mergedPermissions]);

  const groupedPermissions = useMemo(() => {
    const needle = permissionFilter.trim().toLowerCase();
    const matching = needle
      ? mergedPermissions.filter(
          (permission) =>
            permission.key.toLowerCase().includes(needle) ||
            (permission.label ?? '').toLowerCase().includes(needle) ||
            (permission.category ?? '').toLowerCase().includes(needle)
        )
      : mergedPermissions;
    return groupPermissionsByCategory(matching);
  }, [mergedPermissions, permissionFilter]);

  if (!hasPlatformAccess) {
    return (
      <EmptyState
        title="You don't have access to this page"
        description="Platform administration spans every tenant and isn't available to organization roles."
        action={{ label: 'Back to dashboard', onClick: () => router.push('/dashboard') }}
      />
    );
  }

  const visiblePermissionCount = groupedPermissions.reduce(
    (total, group) => total + group.permissions.length,
    0
  );

  return (
    <div className="p-4 space-y-6 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-h1">Roles &amp; permissions</h1>
          <p className="mt-1 text-body-sm text-muted-foreground">
            What every role can do, and which permission keys exist.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            customRoles.refetch();
            catalogue.refetch();
          }}
          disabled={customRoles.isFetching || catalogue.isFetching}
        >
          <RefreshCw
            className={`size-3.5 ${customRoles.isFetching || catalogue.isFetching ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          Refresh
        </Button>
      </div>

      <StatisticCards>
        <StatisticCard title="Built-in roles" value={staticRoles.length} />
        <StatisticCard
          title="Permission keys"
          value={mergedPermissions.length}
          description="Registry catalogue merged with the static enum"
        />
        <StatisticCard
          title="Custom roles"
          value={canViewCustomRoles ? (customRoles.data?.length ?? '—') : '—'}
          description="Your organization only"
        />
        <StatisticCard
          title="Assignable roles"
          value={staticRoles.filter((role) => role.isAssignable).length}
          description="Offered when changing a member's role"
        />
      </StatisticCards>

      {/* ── Built-in roles ─────────────────────────────────────────── */}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
            Built-in roles
          </CardTitle>
          <CardDescription>
            The static role matrix the permission engine enforces. Expand a role to see every
            permission it grants.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RoleMatrixTable roles={staticRoles} permissionLabels={permissionLabels} />
        </CardContent>
      </Card>

      {/* ── Custom roles ───────────────────────────────────────────── */}

      <Card>
        <CardHeader>
          <CardTitle>Custom roles</CardTitle>
          <CardDescription>
            Tenant-defined roles. This endpoint is scoped to your own organization — it cannot list
            another tenant&apos;s roles, even for a platform admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!canViewCustomRoles ? (
            <EmptyState
              title="Custom roles aren't available to your role"
              description="Listing tenant-defined roles needs the custom role view permission."
            />
          ) : customRoles.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : customRoles.isError ? (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" aria-hidden="true" />
              <AlertTitle>Couldn&apos;t load custom roles</AlertTitle>
              <AlertDescription>
                {customRoles.error instanceof Error
                  ? customRoles.error.message
                  : 'An unexpected error occurred.'}
              </AlertDescription>
            </Alert>
          ) : (customRoles.data?.length ?? 0) === 0 ? (
            <EmptyState
              title="No custom roles defined"
              description="Your organization uses the built-in roles above."
            />
          ) : (
            <>
              <CustomRoleTable roles={customRoles.data ?? []} permissionLabels={permissionLabels} />
              {/*
                Stated because it is the difference between a role that
                works and one that cannot be used: the member endpoint
                validates against the static Role enum, so a custom role
                can be defined but not assigned to anyone yet.
              */}
              <Alert>
                <Info className="size-4" aria-hidden="true" />
                <AlertDescription>
                  Custom roles can be defined but not yet assigned to a member — the member role
                  endpoint validates against the built-in role set only.
                </AlertDescription>
              </Alert>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Permission catalogue ───────────────────────────────────── */}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div>
            <CardTitle>Permission catalogue</CardTitle>
            <CardDescription>
              Every permission key the platform recognises, by category.
            </CardDescription>
          </div>
          <div className="relative">
            <Search
              className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={permissionFilter}
              onChange={(event) => setPermissionFilter(event.target.value)}
              placeholder="Filter permissions"
              className="w-64 pl-7"
              aria-label="Filter permissions"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {catalogue.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <>
              {catalogue.isError && (
                // The catalogue provides LABELS, not the permission set
                // itself -- mergePermissionCatalogue falls back to the
                // static enum, so the list below is still complete and
                // enforceable, just less readable. Said plainly rather
                // than shown as a broken section.
                <Alert>
                  <Info className="size-4" aria-hidden="true" />
                  <AlertTitle>Showing keys without registry labels</AlertTitle>
                  <AlertDescription>
                    The permission catalogue couldn&apos;t be loaded, so these are derived from the
                    static permission set. The keys are complete; only the descriptions are missing.
                  </AlertDescription>
                </Alert>
              )}

              {visiblePermissionCount === 0 ? (
                <EmptyState
                  title="No permissions match"
                  description="Adjust the filter to widen the results."
                />
              ) : (
                groupedPermissions.map((group) => (
                  <div key={group.category} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h2 className="text-body-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.category}
                      </h2>
                      <Badge variant="secondary">{group.permissions.length}</Badge>
                    </div>
                    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {group.permissions.map((permission) => (
                        <li
                          key={permission.key}
                          className="rounded-md border border-border p-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-body-sm font-medium text-foreground">
                              {permission.label}
                            </span>
                            {permission.isCustom && <Badge variant="outline">Custom</Badge>}
                          </div>
                          <code className="mt-0.5 block truncate text-caption text-muted-foreground">
                            {permission.key}
                          </code>
                          {permission.description && (
                            <p className="mt-1 text-caption text-muted-foreground">
                              {permission.description}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
