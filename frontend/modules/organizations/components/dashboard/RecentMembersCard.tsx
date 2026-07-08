// frontend/modules/organizations/components/dashboard/RecentMembersCard.tsx

'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { getInitials, getRoleLabel } from '../../utils';
import { ORGANIZATION_ROUTES } from '../../routes';
import type { OrganizationMember } from '../../types';

interface RecentMembersCardProps {
  members: OrganizationMember[];
}

const STATUS_VARIANT: Record<OrganizationMember['status'], 'default' | 'outline' | 'destructive'> = {
  active: 'default',
  invited: 'outline',
  suspended: 'destructive',
};

export function RecentMembersCard({ members }: RecentMembersCardProps) {
  const recent = [...members]
    .sort((a, b) => new Date(b.joinedAt ?? 0).getTime() - new Date(a.joinedAt ?? 0).getTime())
    .slice(0, 5);

  return (
    <div className="p-5 surface-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-h3">Team members</h3>
        <Link
          href={ORGANIZATION_ROUTES.members.root}
          className="flex items-center gap-1 text-sm text-primary hover:underline"
        >
          View all
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">No members yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {recent.map((member) => (
            <li key={member.userId} className="flex items-center gap-3 py-2.5">
              <span className="flex items-center justify-center w-8 h-8 text-xs font-semibold rounded-full shrink-0 bg-primary/10 text-primary">
                {getInitials(member.name)}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate text-foreground">
                  {member.name}
                </span>
                <span className="block text-xs truncate text-muted-foreground">{member.email}</span>
              </span>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {getRoleLabel(member.role)}
              </span>
              <Badge variant={STATUS_VARIANT[member.status]} className="capitalize shrink-0">
                {member.status}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}