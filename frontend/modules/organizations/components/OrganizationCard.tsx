// frontend/modules/organizations/components/OrganizationCard.tsx

'use client';

import { Building2, ChevronRight } from 'lucide-react';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { getInitials, formatSubscriptionTier } from '../utils';
import type { OrganizationListItem } from '../types';

interface OrganizationCardProps {
  organization: OrganizationListItem;
  onSelect: (organizationId: string) => void;
}

const STATUS_VARIANT: Record<OrganizationListItem['status'], 'default' | 'outline' | 'destructive'> = {
  active: 'default',
  suspended: 'destructive',
  archived: 'outline',
};

export function OrganizationCard({ organization, onSelect }: OrganizationCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(organization.id)}
      className="flex items-center w-full gap-4 p-4 text-left transition-shadow surface-card group hover:shadow-md focus-visible:outline-none"
      aria-label={`Open ${organization.name}`}
    >
      <span className="flex items-center justify-center text-sm font-semibold rounded-lg h-11 w-11 shrink-0 bg-primary/10 text-primary">
        {organization.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={organization.logoUrl}
            alt=""
            className="object-cover w-full h-full rounded-lg"
          />
        ) : (
          getInitials(organization.name)
        )}
      </span>

      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span className="font-medium truncate text-foreground">{organization.name}</span>
          {organization.isDefault && (
            <Badge variant="outline" className="shrink-0">
              Owner
            </Badge>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <Building2 className="w-3 h-3" aria-hidden="true" />
          {formatSubscriptionTier(organization.tier)}
          <span aria-hidden="true">&middot;</span>
          <span className="capitalize">{organization.role.replace('_', ' ')}</span>
        </span>
      </span>

      <Badge variant={STATUS_VARIANT[organization.status]} className="capitalize shrink-0">
        {organization.status}
      </Badge>

      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </button>
  );
}