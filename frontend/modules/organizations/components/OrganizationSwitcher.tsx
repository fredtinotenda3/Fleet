// frontend/modules/organizations/components/OrganizationSwitcher.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Check, ChevronsUpDown, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/frontend/shared/ui/navigation/NestedMenu';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { getInitials, formatSubscriptionTier } from '../utils';
import { ORGANIZATION_ROUTES } from '../routes';
import type { OrganizationListItem } from '../types';

interface OrganizationSwitcherProps {
  organizations: OrganizationListItem[];
  currentOrganizationId: string | null;
  onSwitch: (organizationId: string) => void;
  isLoading?: boolean;
}

export function OrganizationSwitcher({
  organizations,
  currentOrganizationId,
  onSwitch,
  isLoading,
}: OrganizationSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const current = organizations.find((o) => o.id === currentOrganizationId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border rounded-md border-border">
        <div className="w-6 h-6 rounded-md skeleton" />
        <div className="h-4 rounded-sm skeleton w-28" />
      </div>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Switch organization"
          aria-haspopup="listbox"
          className="flex items-center w-full gap-2 px-3 py-2 text-sm text-left border rounded-md border-border bg-card hover:bg-muted focus-visible:outline-none"
        >
          <span className="flex items-center justify-center w-6 h-6 text-xs font-semibold rounded-md shrink-0 bg-primary/10 text-primary">
            {current ? getInitials(current.name) : <Building2 className="h-3.5 w-3.5" />}
          </span>
          <span className="flex flex-col flex-1 min-w-0">
            <span className="font-medium truncate text-foreground">
              {current?.name ?? 'Select organization'}
            </span>
            {current && (
              <span className="text-xs truncate text-muted-foreground">
                {formatSubscriptionTier(current.tier)}
              </span>
            )}
          </span>
          <ChevronsUpDown className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Your organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {organizations.length === 0 && (
          <div className="px-2 py-3 text-sm text-muted-foreground">No organizations yet.</div>
        )}

        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            role="option"
            aria-selected={org.id === currentOrganizationId}
            onSelect={() => {
              onSwitch(org.id);
              setOpen(false);
            }}
            className="flex items-center gap-2"
          >
            <span className="flex items-center justify-center w-6 h-6 text-xs font-semibold rounded-md shrink-0 bg-primary/10 text-primary">
              {getInitials(org.name)}
            </span>
            <span className="flex flex-col flex-1 min-w-0">
              <span className="truncate">{org.name}</span>
              <span className="text-xs truncate text-muted-foreground">
                {formatSubscriptionTier(org.tier)}
              </span>
            </span>
            {org.id === currentOrganizationId && (
              <Check className="w-4 h-4 shrink-0 text-primary" aria-hidden="true" />
            )}
            {org.status !== 'active' && (
              <Badge variant="outline" className="ml-1 capitalize shrink-0">
                {org.status}
              </Badge>
            )}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            setOpen(false);
            router.push(ORGANIZATION_ROUTES.select);
          }}
          className="flex items-center gap-2 text-primary"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Create or join organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}