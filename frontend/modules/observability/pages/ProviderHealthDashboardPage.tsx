// frontend/modules/observability/pages/ProviderHealthDashboardPage.tsx
'use client';

import { useRouter } from 'next/navigation';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { Permission, permissionService } from '@/server/permissions/roles';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Alert, AlertTitle, AlertDescription } from '@/frontend/shared/ui/feedback/alert';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/frontend/shared/ui/data-display/card';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';
import { useProviderHealth } from '../hooks/useProviderHealth';
import { ProviderHealthTable } from '../components/ProviderHealthTable';
import { statusPresentation, statusLabel, formatTimestamp } from '../utils/provider-health.utils';

/**
 * Gated on Permission.PLATFORM_VIEW, matching the backend route's own
 * gate (see app/api/observability/telematics/providers/route.ts). This
 * check is a UI convenience only -- it hides the page for people who'd
 * get a 403 anyway, so they see a clear message instead of a failed
 * fetch -- the API's withAuth wrapper remains the actual enforcement
 * point and is unaffected by anything below.
 */
export function ProviderHealthDashboardPage() {
  const router = useRouter();
  const { user } = useAuth();

  const hasAccess = permissionService.hasPermission(user?.roles ?? [], Permission.PLATFORM_VIEW);

  const { data, isLoading, isFetching, isError, error, refetch } = useProviderHealth({
    enabled: hasAccess,
  });

  if (!hasAccess) {
    return (
      <EmptyState
        title="You don't have access to this page"
        description="Provider health is a platform-level view and isn't available to organization roles."
        action={{
          label: 'Back to dashboard',
          onClick: () => router.push('/dashboard'),
        }}
      />
    );
  }

  if (isLoading) {
    return <PageLoader label="Loading provider health" />;
  }

  if (isError || !data) {
    return (
      <div className="p-4 space-y-6 sm:p-6">
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Couldn't load provider health</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'An unexpected error occurred.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const aggregatePresentation = statusPresentation(data.aggregate.status);

  return (
    <div className="p-4 space-y-6 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-h1">Provider health</h1>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Telematics provider status across all tenants.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-body-sm text-foreground hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <StatisticCards>
        <StatisticCard
          title="Overall status"
          value={
            <Badge
              variant={aggregatePresentation.badgeVariant}
              className={`gap-1 text-base ${aggregatePresentation.badgeClassName}`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${aggregatePresentation.dotClassName}`}
                aria-hidden="true"
              />
              {statusLabel(data.aggregate.status)}
            </Badge>
          }
        />
        <StatisticCard title="Providers tracked" value={data.aggregate.providers} />
        <StatisticCard
          title="Unhealthy providers"
          value={data.aggregate.unhealthy}
          description={data.aggregate.unhealthy > 0 ? 'Degraded or unavailable' : 'All providers healthy'}
        />
        <StatisticCard
          title="Last updated"
          value={<span className="text-lg">{formatTimestamp(data.generatedAt)}</span>}
        />
      </StatisticCards>

      <Card>
        <CardHeader>
          <CardTitle>Providers</CardTitle>
        </CardHeader>
        <CardContent>
          {isFetching && !isLoading ? (
            <div className="mb-2">
              <Skeleton className="h-1 w-full" />
            </div>
          ) : null}
          <ProviderHealthTable providers={data.providers} />
        </CardContent>
      </Card>
    </div>
  );
}
