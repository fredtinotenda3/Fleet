// frontend/modules/platform-admin/pages/PlatformAuditLogPage.tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, RefreshCw, ScrollText, ShieldAlert, X } from 'lucide-react';

import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { Permission, permissionService } from '@/server/permissions/roles';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '@/frontend/shared/ui/feedback/alert';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';

import { useAuditLog, useVerifyAuditChain } from '../hooks';
import { AuditLogTable } from '../components/AuditLogTable';
import {
  canFilterAuditLogByTenant,
  formatAuditTimestamp,
  toAuditLogQuery,
} from '../utils/platform-access.utils';
import { AUDIT_LOG_MAX_LIMIT } from '../services/platform-access.api';

/** Server caps `limit` at 100; 25 is a readable page that leaves headroom. */
const PAGE_SIZE = 25;

const EMPTY_FILTERS = {
  category: 'all',
  severity: 'all',
  action: '',
  userId: '',
  entityType: '',
  startDate: '',
  endDate: '',
  tenantId: '',
};

/**
 * The append-only security ledger.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHO SEES WHAT
 * ─────────────────────────────────────────────────────────────────────
 * `AuditLogController.list` builds
 * `tenantId: context.isSuperAdmin ? filters.tenantId : context.tenantId`.
 * So a super admin passing no tenant sees EVERY tenant's entries, and
 * everyone else sees their own -- whatever they pass. The filter is
 * OVERWRITTEN, not rejected, so a non-super-admin who sent a tenantId
 * would get a silently different answer than the form said. The tenant
 * control is therefore rendered only for callers whose input the server
 * will actually honour (`canFilterAuditLogByTenant`).
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY VERIFICATION IS A BUTTON AND NOT A BADGE
 * ─────────────────────────────────────────────────────────────────────
 * GET /api/security/audit-log/verify walks the hash chain rather than
 * reading a cached flag, and a failed verification PUBLISHES an
 * AuditChainIntegrityFailureEvent server-side. Running it on page load
 * would put a real computation and a real event on every visit. It is
 * user-initiated, once, on demand.
 */
export function PlatformAuditLogPage() {
  const router = useRouter();
  const { user } = useAuth();
  const roles = user?.roles ?? [];

  const hasPlatformAccess = permissionService.hasPermission(roles, Permission.PLATFORM_VIEW);
  const canViewAudit = permissionService.hasPermission(roles, Permission.AUDIT_LOG_VIEW);
  const canFilterByTenant = canFilterAuditLogByTenant(roles);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const query = useMemo(
    () =>
      toAuditLogQuery(
        {
          category: filters.category === 'all' ? undefined : filters.category,
          severity: filters.severity === 'all' ? undefined : filters.severity,
          action: filters.action,
          userId: filters.userId,
          entityType: filters.entityType,
          startDate: filters.startDate,
          endDate: filters.endDate,
          tenantId: filters.tenantId,
          page,
          limit: PAGE_SIZE,
        },
        { isSuperAdmin: canFilterByTenant, maxLimit: AUDIT_LOG_MAX_LIMIT }
      ),
    [filters, page, canFilterByTenant]
  );

  const enabled = hasPlatformAccess && canViewAudit;
  const { data, isLoading, isFetching, isError, error, refetch } = useAuditLog(query, { enabled });
  const verification = useVerifyAuditChain(1);

  function updateFilter(key: keyof typeof EMPTY_FILTERS, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    // Any filter change invalidates the current position in the result
    // set -- staying on page 4 of a different query shows an empty
    // table for no visible reason.
    setPage(1);
  }

  const hasActiveFilters = useMemo(
    () =>
      Object.entries(filters).some(([key, value]) =>
        key === 'category' || key === 'severity' ? value !== 'all' : Boolean(value)
      ),
    [filters]
  );

  if (!hasPlatformAccess) {
    return (
      <EmptyState
        title="You don't have access to this page"
        description="Platform administration spans every tenant and isn't available to organization roles."
        action={{ label: 'Back to dashboard', onClick: () => router.push('/dashboard') }}
      />
    );
  }

  if (!canViewAudit) {
    return (
      <EmptyState
        title="The audit log isn't available to your role"
        description="Reading the security ledger needs the audit log view permission."
        action={{ label: 'Back to dashboard', onClick: () => router.push('/dashboard') }}
      />
    );
  }

  if (isLoading) {
    return <PageLoader label="Loading audit log" />;
  }

  const entries = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="p-4 space-y-6 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-h1">Audit log</h1>
          <p className="mt-1 text-body-sm text-muted-foreground">
            {canFilterByTenant
              ? 'The append-only security ledger, across every tenant.'
              : 'The append-only security ledger for your organization.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => verification.refetch()}
            disabled={verification.isFetching}
          >
            <ShieldAlert
              className={`size-3.5 ${verification.isFetching ? 'animate-pulse' : ''}`}
              aria-hidden="true"
            />
            Verify chain
          </Button>
          <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw
              className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Refresh
          </Button>
        </div>
      </div>

      {/*
        Rendered only after the operator asks. `verification.data` is
        undefined until then, and there is deliberately no "chain: OK"
        badge on load -- see the component doc comment.
      */}
      {verification.data && (
        <Alert variant={verification.data.valid ? undefined : 'destructive'}>
          {verification.data.valid ? (
            <CheckCircle2 className="size-4" aria-hidden="true" />
          ) : (
            <AlertTriangle className="size-4" aria-hidden="true" />
          )}
          <AlertTitle>
            {verification.data.valid ? 'Chain intact' : 'Chain integrity failure'}
          </AlertTitle>
          <AlertDescription>
            {verification.data.valid
              ? `${verification.data.checkedEntries} entries verified at ${formatAuditTimestamp(verification.data.verifiedAt)}.`
              : `Broken at sequence ${verification.data.brokenAtSequence ?? 'unknown'}${
                  verification.data.reason ? `: ${verification.data.reason}` : ''
                }. ${verification.data.checkedEntries} entries checked.`}
          </AlertDescription>
        </Alert>
      )}

      {verification.isError && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Couldn&apos;t verify the chain</AlertTitle>
          <AlertDescription>
            {verification.error instanceof Error
              ? verification.error.message
              : 'An unexpected error occurred.'}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="audit-category">Category</Label>
              <Select
                value={filters.category}
                onValueChange={(next) => updateFilter('category', ((next as string | null) ?? 'all'))}
              >
                <SelectTrigger id="audit-category">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  <SelectItem value="domain">Domain</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="audit-severity">Severity</Label>
              <Select
                value={filters.severity}
                onValueChange={(next) => updateFilter('severity', ((next as string | null) ?? 'all'))}
              >
                <SelectTrigger id="audit-severity">
                  <SelectValue placeholder="All severities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severities</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="audit-action">Action</Label>
              <Input
                id="audit-action"
                value={filters.action}
                onChange={(event) => updateFilter('action', event.target.value)}
                placeholder="MEMBER_ROLE_UPDATED"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="audit-user">User ID</Label>
              <Input
                id="audit-user"
                value={filters.userId}
                onChange={(event) => updateFilter('userId', event.target.value)}
                placeholder="Actor's user id"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="audit-entity-type">Entity type</Label>
              <Input
                id="audit-entity-type"
                value={filters.entityType}
                onChange={(event) => updateFilter('entityType', event.target.value)}
                placeholder="organization"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="audit-start">From</Label>
              <Input
                id="audit-start"
                type="date"
                value={filters.startDate}
                onChange={(event) => updateFilter('startDate', event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="audit-end">To</Label>
              <Input
                id="audit-end"
                type="date"
                value={filters.endDate}
                onChange={(event) => updateFilter('endDate', event.target.value)}
              />
              {/*
                The date is widened to the end of the selected day in
                toAuditLogQuery(). A date input hands back midnight, so
                an unwidened "to = today" would exclude everything that
                happened today -- the entries most likely being looked
                for.
              */}
              <p className="text-caption text-muted-foreground">Includes the whole day selected.</p>
            </div>

            {/*
              Only for callers whose tenantId the server will honour.
              For anyone else it is silently overwritten with their own
              tenant, so offering the control would show a different
              result than the form claims.
            */}
            {canFilterByTenant && (
              <div className="space-y-1.5">
                <Label htmlFor="audit-tenant">Tenant</Label>
                <Input
                  id="audit-tenant"
                  value={filters.tenantId}
                  onChange={(event) => updateFilter('tenantId', event.target.value)}
                  placeholder="All tenants"
                />
              </div>
            )}
          </div>

          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setPage(1);
              }}
            >
              <X className="size-3.5" aria-hidden="true" />
              Clear filters
            </Button>
          )}
        </CardContent>
      </Card>

      {isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Couldn&apos;t load the audit log</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'An unexpected error occurred.'}
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {pagination ? `${pagination.total} entries` : `${entries.length} entries`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isFetching && !isLoading ? (
              <div className="mb-2">
                <Skeleton className="h-1 w-full" />
              </div>
            ) : null}

            {entries.length === 0 ? (
              <EmptyState
                icon={<ScrollText className="size-8 text-muted-foreground" aria-hidden="true" />}
                title="No entries match"
                description={
                  hasActiveFilters
                    ? 'Adjust or clear the filters to widen the results.'
                    : 'Nothing has been recorded in this ledger yet.'
                }
              />
            ) : (
              <AuditLogTable entries={entries} showTenant={canFilterByTenant} />
            )}
          </CardContent>
        </Card>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-body-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
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
    </div>
  );
}
