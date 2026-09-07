// frontend/modules/onboarding/components/GetStartedPanel.tsx

'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Check, CircleDashed, HelpCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useSetupProgress } from '../hooks/useSetupProgress';
import { useOnboardingStore } from '../store/onboarding.store';
import { buildOrientation, describeWorkspace } from '../utils/role-orientation';
import type { SetupStep } from '../utils/setup-checklist';

function StepRow({ step, isNext }: { step: SetupStep; isNext: boolean }) {
  const StatusIcon = step.done ? Check : step.indeterminate ? HelpCircle : CircleDashed;

  return (
    <li
      className={cn(
        'flex items-start gap-3 rounded-md border p-3 transition-colors',
        isNext ? 'border-primary/40 bg-primary-50/60 dark:bg-primary-900/20' : 'border-border bg-card'
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
          step.done
            ? 'border-success bg-success text-success-foreground'
            : step.indeterminate
              ? 'border-border text-muted-foreground'
              : 'border-border text-muted-foreground'
        )}
      >
        <StatusIcon className="size-3" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p
            className={cn(
              'text-body-sm font-medium',
              step.done ? 'text-muted-foreground line-through decoration-muted-foreground/40' : 'text-foreground'
            )}
          >
            {step.title}
          </p>
          {step.detail && !step.indeterminate && (
            <span className="text-caption text-muted-foreground tabular-nums">{step.detail}</span>
          )}
          {step.indeterminate && (
            // Never rendered as "not done": a failed or pending request must
            // not tell an administrator their fleet is empty.
            <span className="text-caption text-muted-foreground">status unavailable</span>
          )}
        </div>

        {!step.done && <p className="mt-1 text-caption text-muted-foreground">{step.description}</p>}
      </div>

      {!step.done && (
        <Button
          variant={isNext ? 'default' : 'outline'}
          size="xs"
          render={<Link href={step.href} />}
          nativeButton={false}
          className="shrink-0"
        >
          {step.actionLabel}
        </Button>
      )}
    </li>
  );
}

/**
 * The first-login experience.
 *
 * Two modes, chosen by what the user may actually do:
 *
 *  - SETUP MODE, for anyone holding at least one setup permission. A
 *    dependency-ordered checklist computed from the organization's real
 *    counts, not from a stored "have they seen this" flag. It disappears on
 *    its own once every step is genuinely done, so a mature tenant never
 *    sees it.
 *
 *  - ORIENTATION MODE, for everyone else. A driver or mechanic has nothing
 *    to configure; what they need is a sentence saying what their copy of
 *    the platform is for and the two or three places their work lives.
 *
 * The panel renders nothing at all when there is nothing useful to say.
 */
export function GetStartedPanel({ className }: { className?: string }) {
  const user = useSessionStore((s) => s.user);
  const roles = React.useMemo(() => user?.roles ?? [], [user?.roles]);

  const isDismissed = useOnboardingStore((s) => s.isDismissed);
  const dismiss = useOnboardingStore((s) => s.dismiss);
  const dismissed = isDismissed(user?.id);

  const progress = useSetupProgress(roles, !dismissed);
  const orientation = React.useMemo(() => buildOrientation(roles), [roles]);
  const workspaceDescription = React.useMemo(() => describeWorkspace(roles), [roles]);

  const hasChecklist = progress.total > 0;

  // Dismissed, or setup genuinely finished — say nothing. `isComplete` is
  // false while any step is indeterminate, so a failed request cannot make
  // the panel vanish by claiming setup is done.
  if (dismissed || (hasChecklist && progress.isComplete)) return null;

  if (hasChecklist) {
    return (
      <section
        className={cn('rounded-lg border border-border bg-card shadow-xs', className)}
        aria-labelledby="get-started-heading"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 id="get-started-heading" className="text-h3 text-foreground">
              Finish setting up your fleet
            </h2>
            <p className="mt-0.5 text-body-sm text-muted-foreground">
              {progress.isIndeterminate
                ? 'Checking what your organization already has…'
                : progress.nextStep
                  ? `Next: ${progress.nextStep.title.toLowerCase()}.`
                  : 'Almost there.'}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!progress.isIndeterminate && (
              <span className="text-caption text-muted-foreground tabular-nums">
                {progress.completed} of {progress.known} done
              </span>
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => dismiss(user?.id)}
              aria-label="Hide setup checklist"
            >
              <X className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="p-4">
          {progress.known > 0 && (
            <div
              className="mb-3 h-1 w-full overflow-hidden rounded-full bg-muted"
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

          {progress.isLoading && progress.isIndeterminate ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <ol className="space-y-2">
              {progress.steps.map((step) => (
                <StepRow key={step.id} step={step} isNext={progress.nextStep?.id === step.id} />
              ))}
            </ol>
          )}
        </div>
      </section>
    );
  }

  // Orientation mode. Rendered only on a genuinely empty landing — an
  // operations user with a working fleet does not need this every day.
  if (orientation.length === 0) return null;

  return (
    <section
      className={cn('rounded-lg border border-border bg-card shadow-xs', className)}
      aria-labelledby="orientation-heading"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 id="orientation-heading" className="text-h3 text-foreground">
            Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </h2>
          <p className="mt-0.5 text-body-sm text-muted-foreground">{workspaceDescription}</p>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => dismiss(user?.id)}
          aria-label="Hide welcome panel"
          className="shrink-0"
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      </div>

      <ul className="grid gap-2 p-4 sm:grid-cols-3">
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
    </section>
  );
}
