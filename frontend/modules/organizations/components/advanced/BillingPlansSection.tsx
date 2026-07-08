// frontend/modules/organizations/components/advanced/BillingPlansSection.tsx
'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { useBillingPlans, useUpgradePlan } from '../../hooks/useAdvancedSettings';
import { formatSubscriptionTier } from '../../utils';
import type { Organization } from '../../types';

interface Props {
  organization: Organization;
}

function getFeatures(features: unknown): string[] {
  if (Array.isArray(features)) return features;
  if (typeof features === 'string') return features.split(',').map((f) => f.trim());
  return [];
}

export function BillingPlansSection({ organization }: Props) {
  const { data: plans = [], isLoading } = useBillingPlans();
  const upgradePlan = useUpgradePlan();
  const [confirmPlanId, setConfirmPlanId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-48 skeleton" />
        ))}
      </div>
    );
  }

  const confirmPlan = plans.find((p) => p.id === confirmPlanId);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.tier === organization.subscription.tier;
          const features = getFeatures(plan.features);
          return (
            <div
              key={plan.id}
              className={`p-5 surface-card ${isCurrent ? 'ring-2 ring-primary' : ''}`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-h3">{formatSubscriptionTier(plan.tier)}</h3>
                {isCurrent && <Badge>Current</Badge>}
              </div>
              <p className="mb-4 text-h2">
                ${plan.priceMonthly}
                <span className="font-normal text-body-sm text-muted-foreground">/mo</span>
              </p>
              <p className="mb-3 text-body-sm text-muted-foreground">Up to {plan.seats} seats</p>
              <ul className="mb-4 space-y-1.5 text-body-sm">
                {features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                variant={isCurrent ? 'outline' : 'default'}
                disabled={isCurrent}
                onClick={() => setConfirmPlanId(plan.id)}
              >
                {isCurrent ? 'Current plan' : 'Switch to this plan'}
              </Button>
            </div>
          );
        })}
      </div>

      {confirmPlan && (
        <div role="alertdialog" aria-label="Confirm plan change" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-sm p-5 surface-card">
            <h3 className="text-h3">Switch to {formatSubscriptionTier(confirmPlan.tier)}?</h3>
            <p className="mt-1.5 text-body-sm text-muted-foreground">
              Billing will adjust at your next invoice cycle to ${confirmPlan.priceMonthly}/mo.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setConfirmPlanId(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  upgradePlan.mutate(confirmPlan.id);
                  setConfirmPlanId(null);
                }}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}