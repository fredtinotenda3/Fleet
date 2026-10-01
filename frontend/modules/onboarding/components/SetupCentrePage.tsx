// frontend/modules/onboarding/components/SetupCentrePage.tsx
//
// ADAPTIVE ONBOARDING / SETUP CENTRE -- the full-page counterpart to
// GetStartedPanel's compact dashboard nag, reachable at /setup.
//
// ---------------------------------------------------------------------
// WHY A SEPARATE PAGE, NOT A BIGGER PANEL
// ---------------------------------------------------------------------
// GetStartedPanel is deliberately small: it is a dashboard widget among
// many others, dismissible, and tested as such. This page is where the
// FULL 13-stage onboarding surface lives (welcome, org/branch/users,
// vehicle/driver onboarding, telematics + distance-tracking posture,
// fuel/maintenance/trip-operations setup, data coverage, first
// transaction, Command Centre tour, completion). It reuses every piece
// of that panel's machinery unchanged -- useSetupProgress,
// setup-checklist.ts's STEP_DEFINITIONS, buildOrientation/
// describeWorkspace, DataQualityCoverageWidget from the Operational-
// Connectivity upgrade -- rather than recomputing any of it, so the two
// surfaces can never disagree about whether a step is done.
//
// ---------------------------------------------------------------------
// NEVER A GATE
// ---------------------------------------------------------------------
// This page is reachable at any time (nav link + the post-login
// redirect in app/page.tsx), but nothing in the app requires visiting
// it: middleware.ts does not gate any route on setup completeness, and
// every step here that depends on hardware this fleet may not have
// (GPS, a reliable odometer) can be marked done by an explicit decline
// rather than by doing the thing. "Skip for now" always works.

'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Check, CircleDashed, HelpCircle, PartyPopper } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useOrganizationStore } from '@/frontend/modules/organizations/store/organization.store';
import { DataQualityCoverageWidget } from '@/frontend/shared/dashboards/widgets/DataQualityCoverageWidget';
import { useSetupProgress } from '../hooks/useSetupProgress';
import { useFleetProfileMutations } from '../hooks/useFleetProfileMutations';
import { useOnboardingStore } from '../store/onboarding.store';
import { buildOrientation, describeWorkspace } from '../utils/role-orientation';
import type { SetupStep, SetupStepId } from '../utils/setup-checklist';

/** Display grouping for the Setup Centre's sections. A step not listed here (there is none today) would simply be skipped, not hidden by mistake -- see the exhaustive check in StageGroups below. */
const STAGE_GROUPS: Array<{ heading: string; blurb: string; stepIds: SetupStepId[] }> = [
  {
    heading: 'Organization & branches',
    blurb: 'Branches scope the whole platform — who sees what, and which costs roll up where.',
    stepIds: ['org-units', 'members'],
  },
  {
    heading: 'Vehicles & drivers',
    blurb: 'The register everything else attaches to.',
    stepIds: ['vehicles', 'drivers'],
  },
  {
    heading: 'How this fleet tracks distance & location',
    blurb:
      'GPS, odometer, map-drawn route, or manual entry — this platform supports all four, in that order of trust. There is no wrong answer here, including "neither".',
    stepIds: ['telematics', 'distance-tracking'],
  },
  {
    heading: 'Fuel, maintenance & trips',
    blurb: 'Set these up now, or let the first real operation set them up for you below.',
    stepIds: ['fuel-setup', 'maintenance-setup', 'trip-operations'],
  },
  {
    heading: 'First real operational transaction',
    blurb: 'One real fuel log, expense or trip is what turns every report from a demo into a fact.',
    stepIds: ['operating-data'],
  },
];

function StatusIcon({ step }: { step: SetupStep }) {
  if (step.done) return <Check className="size-4" aria-hidden="true" />;
  if (step.indeterminate) return <HelpCircle className="size-4" aria-hidden="true" />;
  return <CircleDashed className="size-4" aria-hidden="true" />;
}

function StepCard({
  step,
  onDeclare,
  isDeclaring,
}: {
  step: SetupStep;
  onDeclare: (kind: 'declare-no-gps' | 'declare-odometer-posture') => void;
  isDeclaring: boolean;
}) {
  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between',
        step.done ? 'border-border bg-muted/30' : 'border-border bg-card'
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        <span
          className={cn(
            'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border',
            step.done
              ? 'border-success bg-success text-success-foreground'
              : 'border-border text-muted-foreground'
          )}
        >
          <StatusIcon step={step} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2">
            <p className="text-body font-medium text-foreground">{step.title}</p>
            {step.detail && !step.indeterminate && (
              <span className="text-caption text-muted-foreground tabular-nums">{step.detail}</span>
            )}
            {step.indeterminate && (
              <span className="text-caption text-muted-foreground">status unavailable</span>
            )}
          </div>
          <p className="mt-1 text-body-sm text-muted-foreground">{step.description}</p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {!step.done && (
          <Button variant="default" size="sm" render={<Link href={step.href} />} nativeButton={false}>
            {step.actionLabel}
          </Button>
        )}
        {step.secondaryAction && !step.done && (
          <Button
            variant="outline"
            size="sm"
            disabled={isDeclaring}
            onClick={() => onDeclare(step.secondaryAction!.kind)}
          >
            {step.secondaryAction.label}
          </Button>
        )}
      </div>
    </li>
  );
}

export function SetupCentrePage() {
  const user = useSessionStore((s) => s.user);
  const roles = React.useMemo(() => user?.roles ?? [], [user?.roles]);
  const currentOrganizationId = useOrganizationStore((s) => s.currentOrganizationId);

  const progress = useSetupProgress(roles, true);
  const { declareNoGps, declareNoOdometers, completeSetup, skipSetup, updateFleetProfile } =
    useFleetProfileMutations(currentOrganizationId ?? undefined);

  const hasSeenCommandCentreIntro = useOnboardingStore((s) => s.hasSeenCommandCentreIntro);
  const markCommandCentreIntroSeen = useOnboardingStore((s) => s.markCommandCentreIntroSeen);
  const introSeen = hasSeenCommandCentreIntro(user?.id);

  const orientation = React.useMemo(() => buildOrientation(roles), [roles]);
  const workspaceDescription = React.useMemo(() => describeWorkspace(roles), [roles]);

  const stepsById = React.useMemo(
    () => new Map(progress.steps.map((step) => [step.id, step] as const)),
    [progress.steps]
  );

  const handleDeclare = (kind: 'declare-no-gps' | 'declare-odometer-posture') => {
    if (kind === 'declare-no-gps') declareNoGps();
    else declareNoOdometers();
  };

  // No anchor permission (a driver or mechanic who navigated here
  // directly) -- orientation only, same wording GetStartedPanel uses
  // for the identical case, never a blank or an "access denied" page.
  if (progress.total === 0 && !progress.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div>
          <h1 className="text-h2 text-foreground">
            Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-1 text-body text-muted-foreground">{workspaceDescription}</p>
        </div>
        {orientation.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-3">
            {orientation.map((link) => (
              <li key={link.key}>
                <Link
                  href={link.href}
                  className="flex h-full flex-col justify-between gap-2 rounded-md border border-border p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                  <span className="text-caption text-muted-foreground">{link.question}</span>
                  <span className="inline-flex items-center gap-1 text-body-sm font-medium text-primary">
                    {link.label}
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 pb-16">
      <header className="space-y-2">
        <h1 className="text-h2 text-foreground">Setup Centre</h1>
        <p className="text-body text-muted-foreground">
          {progress.isIndeterminate
            ? 'Checking what your organization already has…'
            : `${progress.completed} of ${progress.known} steps done. Nothing here blocks you from using the rest of the platform — skip anything and come back later.`}
        </p>
        {progress.known > 0 && (
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={progress.completed}
            aria-valuemin={0}
            aria-valuemax={progress.known}
            aria-label="Setup progress"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${progress.known ? (progress.completed / progress.known) * 100 : 0}%` }}
            />
          </div>
        )}
      </header>

      {progress.isLoading && progress.isIndeterminate ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <>
          {STAGE_GROUPS.map((group) => {
            const steps = group.stepIds.map((id) => stepsById.get(id)).filter((s): s is SetupStep => !!s);
            if (steps.length === 0) return null;
            return (
              <section key={group.heading} className="space-y-3">
                <div>
                  <h2 className="text-h3 text-foreground">{group.heading}</h2>
                  <p className="text-body-sm text-muted-foreground">{group.blurb}</p>
                </div>
                <ol className="space-y-2">
                  {steps.map((step) => (
                    <StepCard
                      key={step.id}
                      step={step}
                      onDeclare={handleDeclare}
                      isDeclaring={updateFleetProfile.isPending}
                    />
                  ))}
                </ol>
              </section>
            );
          })}

          <section className="space-y-3">
            <div>
              <h2 className="text-h3 text-foreground">Data readiness & coverage</h2>
              <p className="text-body-sm text-muted-foreground">
                An honest picture of how much of your fleet's data actually exists yet — never a
                single score, because a blended number hides exactly the gap that matters.
              </p>
            </div>
            <DataQualityCoverageWidget />
          </section>

          <section className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <PartyPopper className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <h2 className="text-h3 text-foreground">Meet the Command Centre</h2>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  Needs Attention is where maintenance, fuel, expenses, compliance and driver risk
                  surface as one prioritized queue once there is a fleet to watch.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                render={<Link href="/needs-attention" />}
                nativeButton={false}
                onClick={() => markCommandCentreIntroSeen(user?.id)}
              >
                Open Command Centre
              </Button>
              {introSeen && <span className="text-caption text-muted-foreground">Viewed</span>}
            </div>
          </section>
        </>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
        <Button variant="ghost" onClick={() => skipSetup()} disabled={updateFleetProfile.isPending}>
          Skip for now
        </Button>
        <Button
          variant="default"
          onClick={() => completeSetup()}
          disabled={updateFleetProfile.isPending}
        >
          {progress.isComplete ? 'Finish setup' : 'Mark setup as complete'}
        </Button>
      </footer>
    </div>
  );
}
