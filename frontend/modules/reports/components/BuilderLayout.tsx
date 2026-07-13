// frontend/modules/reports/components/BuilderLayout.tsx

'use client';

import type { ReactNode } from 'react';
import { BUILDER_STEPS, type BuilderStep } from '../routes/builder';

const STEP_LABELS: Record<BuilderStep, string> = {
  columns: 'Columns',
  filters: 'Filters',
  groupBy: 'Group by',
  sort: 'Sort',
  preview: 'Preview',
  save: 'Save',
};

interface BuilderLayoutProps {
  activeStep: BuilderStep;
  onStepChange: (step: BuilderStep) => void;
  sidebar?: ReactNode;
  children: ReactNode;
}

export function BuilderLayout({ activeStep, onStepChange, sidebar, children }: BuilderLayoutProps) {
  const activeIndex = BUILDER_STEPS.indexOf(activeStep);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
      {sidebar && <aside className="order-2 lg:order-1">{sidebar}</aside>}

      <div className={sidebar ? 'order-1 lg:order-2' : ''}>
        <ol className="flex flex-wrap items-center gap-2 mb-6" aria-label="Report builder steps">
          {BUILDER_STEPS.map((step, index) => {
            const isActive = step === activeStep;
            const isComplete = index < activeIndex;
            return (
              <li key={step}>
                <button
                  type="button"
                  onClick={() => onStepChange(step)}
                  aria-current={isActive ? 'step' : undefined}
                  className={
                    isActive
                      ? 'rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground'
                      : isComplete
                      ? 'rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary'
                      : 'rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent'
                  }
                >
                  {index + 1}. {STEP_LABELS[step]}
                </button>
              </li>
            );
          })}
        </ol>

        <div className="p-4 border rounded-lg sm:p-6">{children}</div>
      </div>
    </div>
  );
}