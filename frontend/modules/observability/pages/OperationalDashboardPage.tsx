// frontend/modules/observability/pages/OperationalDashboardPage.tsx
'use client';

import { useRouter } from 'next/navigation';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { Permission, permissionService } from '@/server/permissions/roles';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Alert, AlertTitle, AlertDescription, AlertAction } from '@/frontend/shared/ui/feedback/alert';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useProviderHealth } from '../hooks/useProviderHealth';
import { useOutboxSummary } from '../hooks/useOutboxSummary';
import { useObservabilitySummary } from '../hooks/useObservabilitySummary';
import { OperationalSummaryCards } from '../components/OperationalSummaryCards';
import { TelemetrySyncStatus } from '../components/TelemetrySyncStatus';
import { OutboxStatusTable } from '../components/OutboxStatusTable';

/**
 * Gated on Permission.PLATFORM_VIEW, matching the Provider Health
 * dashboard and the provider/outbox endpoints this page depends on
 * (see app/api/observability/telematics/providers/route.ts and
 * app/api/observability/outbox/route.ts). This check is a UI
 * convenience only -- it hides the page for people who'd get a 403
 * anyway -- the API's withAuth wrapper remains the actual enforcement
 * point.
 *
 * ONE EXCEPTION: the third data source, GET /api/observability/summary,
 * is gated on Permission.JOB_VIEW instead (see that route's own
 * comment, and the note on ObservabilitySummaryResponse in ../types).
 * In today's role table only Role.SUPER_ADMIN holds either permission,
 * so this can't currently produce a partial page for anyone who can
 * reach it at all -- but the query is still wired to fail
 * independently rather than assumed to succeed just because
 * PLATFORM_VIEW passed, so a future role split doesn't silently break
 * this page.
 */
export function OperationalDashboardPage() {
  const router = useRouter();
  const { user } = useAuth();

  const hasAccess = permissionService.hasPermission(user?.roles ?? [], Permission.PLATFORM_VIEW);

  const providerHealth = useProviderHealth({ enabled: hasAccess });
  const outboxSummary = useOutboxSummary({ enabled: hasAccess });
  const observabilitySummary = useObservabilitySummary({ enabled: hasAccess });

  if (!hasAccess) {
    return (
      <EmptyState
        title="You don't have access to this page"
        description="The operational dashboard is a platform-level view and isn't available to organization roles."
        action={{
          label: 'Back to dashboard',
          onClick: () => router.push('/dashboard'),
        }}
      />
    );
  }

  const isInitialLoading = providerHealth.isLoading || outboxSummary.isLoading;

  if (isInitialLoading) {
    return <PageLoader label="Loading operational dashboard" />;
  }

  // Provider health and outbox are both required to render the page's
  // core sections. The summary query is handled separately below and
  // is allowed to fail without blocking the rest of the dashboard --
  // see the permission note above.
  const coreError = providerHealth.error ?? outboxSummary.error;
  const hasCoreData = Boolean(providerHealth.data && outboxSummary.data);

  const refetchAll = () => {
    providerHealth.refetch();
    outboxSummary.refetch();
    observabilitySummary.refetch();
  };

  if ((providerHealth.isError || outboxSummary.isError) && !hasCoreData) {
    return (
      <div className="p-4 space-y-6 sm:p-6">
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Couldn't load the operational dashboard</AlertTitle>
          <AlertDescription>
            {coreError instanceof Error ? coreError.message : 'An unexpected error occurred.'}
          </AlertDescription>
          <AlertAction>
            <button
              type="button"
              onClick={refetchAll}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-body-sm text-foreground hover:bg-muted"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Retry
            </button>
          </AlertAction>
        </Alert>
      </div>
    );
  }

  if (!providerHealth.data || !outboxSummary.data) {
    return (
      <EmptyState
        title="No operational data available"
        description="Provider health and outbox data will appear here once the platform has activity to report."
      />
    );
  }

  const isFetching = providerHealth.isFetching || outboxSummary.isFetching || observabilitySummary.isFetching;

  return (
    <div className="p-4 space-y-6 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-h1">Operational dashboard</h1>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Platform-wide health at a glance: telematics providers, the event outbox, and error activity.
          </p>
        </div>
        <button
          type="button"
          onClick={refetchAll}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-body-sm text-foreground hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <OperationalSummaryCards
        providerAggregate={providerHealth.data.aggregate}
        outboxCounts={outboxSummary.data.counts}
        unhandledErrors={
          observabilitySummary.data ? observabilitySummary.data.errors.unhandled : null
        }
      />

      {observabilitySummary.isError && (
        <Alert>
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Error-rate metrics unavailable</AlertTitle>
          <AlertDescription>
            {observabilitySummary.error instanceof Error
              ? observabilitySummary.error.message
              : "Couldn't load the metrics summary. Provider and outbox data above are unaffected."}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Telemetry sync status</CardTitle>
        </CardHeader>
        <CardContent>
          {providerHealth.isFetching && !providerHealth.isLoading ? (
            <div className="mb-2">
              <Skeleton className="h-1 w-full" />
            </div>
          ) : null}
          <TelemetrySyncStatus providers={providerHealth.data.providers} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outbox status</CardTitle>
        </CardHeader>
        <CardContent>
          {outboxSummary.isFetching && !outboxSummary.isLoading ? (
            <div className="mb-2">
              <Skeleton className="h-1 w-full" />
            </div>
          ) : null}
          <OutboxStatusTable counts={outboxSummary.data.counts} />
        </CardContent>
      </Card>
    </div>
  );
}
