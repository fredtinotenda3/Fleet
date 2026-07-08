// frontend/modules/organizations/components/dashboard/BillingSummaryCard.tsx

'use client';

import Link from 'next/link';
import { CreditCard, ArrowUpRight } from 'lucide-react';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { formatSubscriptionTier, getSeatsRemaining } from '../../utils';
import { ORGANIZATION_ROUTES } from '../../routes';
import type { Organization } from '../../types';

interface BillingSummaryCardProps {
  organization: Organization;
  canManageBilling: boolean;
}

const STATUS_LABEL: Record<Organization['subscription']['status'], string> = {
  active: 'Active',
  past_due: 'Past due',
  canceled: 'Canceled',
  trialing: 'Trialing',
};

const STATUS_VARIANT: Record<Organization['subscription']['status'], 'default' | 'destructive' | 'outline'> = {
  active: 'default',
  past_due: 'destructive',
  canceled: 'outline',
  trialing: 'outline',
};

export function BillingSummaryCard({ organization, canManageBilling }: BillingSummaryCardProps) {
  const { subscription } = organization;
  const seatsRemaining = getSeatsRemaining(organization);

  return (
    <div className="p-5 surface-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-h3">Billing & subscription</h3>
        </div>
        <Badge variant={STATUS_VARIANT[subscription.status]}>{STATUS_LABEL[subscription.status]}</Badge>
      </div>

      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-caption text-muted-foreground">Plan</dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {formatSubscriptionTier(subscription.tier)}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">Seats</dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {subscription.usedSeats} / {subscription.seats}{' '}
            <span className="font-normal text-caption text-muted-foreground">
              ({seatsRemaining} left)
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">Start date</dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {new Date(subscription.startDate).toLocaleDateString()}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">Renews / ends</dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {subscription.endDate ? new Date(subscription.endDate).toLocaleDateString() : '—'}
          </dd>
        </div>
      </dl>

      {canManageBilling && (
        <Button 
          render={<Link href={ORGANIZATION_ROUTES.advanced.billing} />}
          nativeButton={false}
          variant="outline" 
          size="sm" 
          className="mt-4"
        >
          Manage billing
          <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}