// frontend/modules/ai/pages/DriverScorecardPage.tsx
//
// Gated on Permission.ANALYTICS_VIEW, matching GET /api/ai/driver-risk's
// own gate (see app/api/ai/driver-risk/route.ts -- withAuth(...,
// { permission: Permission.ANALYTICS_VIEW })). There is no dedicated
// "driver-view" permission defined in server/permissions/roles.ts
// today; ANALYTICS_VIEW is the actual permission this endpoint
// enforces, so the page gates on that rather than a permission that
// doesn't exist on the wire.
//
// TWO MODES, ONE COMPONENT:
//   - No `driverId` prop (route: /drivers/scorecard) -> picker: lists
//     every driver in scope via useDriverRiskList() and lets the user
//     pick one to view.
//   - `driverId` prop supplied (route: /drivers/[id]/scorecard) ->
//     the full scorecard for that one driver via useDriverRisk(driverId).
//
// The picker reuses the SAME ids the driver-risk batch endpoint returns
// (AIBatchItem.entityId / DriverRiskScore.driverId). As of the fix to
// driver-risk.service.ts, that id IS the tbldrivers `_id` -- the same
// roster and the same id DriverSelect/useDriversList already use -- so
// there is no longer a mismatch between "who driver-risk scores" and
// "who the Drivers table/vehicle picker call a driver".

'use client';

import { useRouter } from 'next/navigation';
import { AlertTriangle, Search } from 'lucide-react';
import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { Permission, permissionService } from '@/server/permissions/roles';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { Alert, AlertTitle, AlertDescription } from '@/frontend/shared/ui/feedback/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { useDriverRisk, useDriverRiskList } from '../hooks/useDriverRisk';
import { DriverRiskGauge } from '../components/DriverRiskGauge';
import { DriverRiskSubScore } from '../components/DriverRiskSubScore';
import { DriverRiskTrend } from '../components/DriverRiskTrend';
import { DriverIncidentList } from '../components/DriverIncidentList';
import { AI_ROUTES } from '../routes';
import {
  riskLevelPresentation,
  riskLevelLabel,
  formatRiskScore,
  formatRiskTimestamp,
  formatEvidenceLine,
} from '../utils/driver-risk.utils';
import type { DriverRiskBatchItem } from '../types/driver-risk.types';

interface DriverScorecardPageProps {
  /** tbldrivers `_id` -- see the doc comment above and on DriverRiskScore.driverId. */
  driverId?: string;
}

export function DriverScorecardPage({ driverId }: DriverScorecardPageProps) {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const hasAccess = permissionService.hasPermission(roles, Permission.ANALYTICS_VIEW);

  if (!hasAccess) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          title="You don't have access to this page"
          description="Driver risk scorecards aren't available to your role."
        />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 sm:p-6">
      <PageHeader
        title="Driver Scorecard"
        description="AI-generated driver risk score, sub-scores, trend, and recent incidents."
        breadcrumbs={[{ label: 'Drivers', href: '/drivers' }, { label: 'Scorecard' }]}
      />
      {driverId ? <DriverScorecardDetail driverId={driverId} /> : <DriverScorecardPicker />}
    </div>
  );
}

// ─── Picker (no driverId): choose a driver from the batch endpoint ─────────

function DriverScorecardPicker() {
  const router = useRouter();
  const { data, isLoading, isError, error } = useDriverRiskList();

  if (isLoading) {
    return <LoadingState type="table" count={6} />;
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" aria-hidden="true" />
        <AlertTitle>Couldn't load driver risk scores</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : 'An unexpected error occurred.'}
        </AlertDescription>
      </Alert>
    );
  }

  const items = data?.results ?? [];
  const scored = items.filter((item): item is DriverRiskBatchItem & { data: NonNullable<DriverRiskBatchItem['data']> } =>
    item.success && Boolean(item.data)
  );

  if (scored.length === 0) {
    return (
      <EmptyState
        title="No drivers to score"
        description="No drivers with trip or telematics history were found in your scope."
      />
    );
  }

  return (
    <div className="space-y-4">
      <StatisticCards>
        <StatisticCard title="Drivers scored" value={data?.succeeded ?? scored.length} />
        <StatisticCard
          title="High / critical risk"
          value={scored.filter((d) => d.data.riskLevel === 'high' || d.data.riskLevel === 'critical').length}
        />
        {/*
          DATA HONESTY AUDIT: see DriverScorecardDetail's `hasNoData` note.
          Surfaced here too so a manager scanning the picker -- not just
          someone who already opened one driver -- can tell how many of
          "Drivers scored" are actually unobserved rather than assessed.
        */}
        <StatisticCard
          title="Scored on no data"
          value={scored.filter((d) => !d.data.evidence || d.data.evidence.length === 0).length}
        />
        <StatisticCard title="Scoring failures" value={data?.failed ?? 0} />
      </StatisticCards>

      <Card>
        <CardHeader>
          <CardTitle>Select a driver</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {scored
              .slice()
              .sort((a, b) => b.data.overallScore - a.data.overallScore)
              .map((item) => {
                const presentation = riskLevelPresentation(item.data.riskLevel);
                const noData = !item.data.evidence || item.data.evidence.length === 0;
                return (
                  <li key={item.entityId}>
                    <button
                      type="button"
                      onClick={() => router.push(AI_ROUTES.driverScorecard(item.entityId))}
                      className="flex w-full items-center justify-between gap-3 px-(--card-spacing) py-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="truncate text-sm font-medium text-foreground">
                          {item.data.driverName}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {noData ? (
                          <Badge variant="outline" className="text-muted-foreground" title="No trips or telemetry in scope for this driver yet">
                            No data
                          </Badge>
                        ) : (
                          <>
                            <span className="text-sm text-muted-foreground">
                              {formatRiskScore(item.data.overallScore)}/100
                            </span>
                            <Badge variant={presentation.badgeVariant} className={presentation.badgeClassName}>
                              {riskLevelLabel(item.data.riskLevel)}
                            </Badge>
                          </>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Detail (driverId supplied): the full scorecard for one driver ────────

function DriverScorecardDetail({ driverId }: { driverId: string }) {
  const { data: score, isLoading, isError, error } = useDriverRisk(driverId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError) {
    const notFound = error instanceof Error && /not found/i.test(error.message);
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" aria-hidden="true" />
        <AlertTitle>{notFound ? 'Driver not found' : "Couldn't load this driver's risk score"}</AlertTitle>
        <AlertDescription>
          {notFound
            ? "This driver id doesn't have a risk score in your scope."
            : error instanceof Error
              ? error.message
              : 'An unexpected error occurred.'}
        </AlertDescription>
      </Alert>
    );
  }

  if (!score) {
    return <EmptyState title="No risk score available" description="This driver has no risk score to display." />;
  }

  // DATA HONESTY AUDIT: driver-risk.service.ts deliberately omits `evidence`
  // entirely for a driver with no matching trips and no telemetry (see its
  // own comment: "a default-safe score with nothing behind it... omitted
  // rather than an empty array, so 'scored on no data' is visible"). That
  // signal existed on the wire but nothing in this page read it -- the
  // gauge rendered "0/100, Low risk" exactly as confidently for a driver
  // never assigned a trip as for one with a hundred clean ones, which is
  // fabricated confidence: 0/100 here means "nothing observed," not "safe."
  const hasNoData = !score.evidence || score.evidence.length === 0;

  return (
    <div className="space-y-6">
      {hasNoData && (
        <Alert>
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>No data behind this score yet</AlertTitle>
          <AlertDescription>
            This driver has no trips or telemetry readings in scope. The {formatRiskScore(score.overallScore)}/100
            below is the default for an unobserved driver, not a measured &quot;safe&quot; result -- it will start
            reflecting real driving once trips or telemetry are recorded for them.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{score.driverName}</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <DriverRiskGauge score={score.overallScore} riskLevel={score.riskLevel} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sub-scores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DriverRiskSubScore label="Safety" score={score.metrics.safetyScore} invert />
            <DriverRiskSubScore label="Fatigue" score={score.metrics.fatigueScore} />
            <DriverRiskSubScore label="Distraction" score={score.metrics.distractionScore} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Risk trend</CardTitle>
        </CardHeader>
        <CardContent>
          <DriverRiskTrend trends={score.trends} />
        </CardContent>
      </Card>

      {score.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc space-y-1 text-sm text-foreground">
              {score.recommendations.map((rec, i) => (
                <li key={i}>{rec}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent incidents</CardTitle>
        </CardHeader>
        <CardContent>
          <DriverIncidentList incidents={score.incidents} />
        </CardContent>
      </Card>

      {score.evidence && score.evidence.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Evidence</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {score.evidence.map((ev, i) => (
                <li key={i}>{formatEvidenceLine(ev)}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Last calculated {formatRiskTimestamp(score.timestamp)}.
      </p>
    </div>
  );
}
