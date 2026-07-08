// frontend/modules/organizations/components/members/MembersTable.tsx
'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/frontend/shared/ui/forms/select';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { EditMemberRoleDialog } from './EditMemberRoleDialog';
import { MemberRowActions } from './MemberRowActions';
import { getInitials, getRoleLabel } from '../../utils';
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '../../types';
import type { OrganizationMember } from '../../types';

interface MembersTableProps {
  organizationId: string;
  members: OrganizationMember[];
  canManage: boolean;
}

const PAGE_SIZE = 10;

const STATUS_VARIANT: Record<OrganizationMember['status'], 'default' | 'outline' | 'destructive'> = {
  active: 'default',
  invited: 'outline',
  suspended: 'destructive',
};

export function MembersTable({ organizationId, members, canManage }: MembersTableProps) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [editingMember, setEditingMember] = useState<OrganizationMember | null>(null);

  const filtered = useMemo(() => {
    return members.filter((m) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!m.name.toLowerCase().includes(q) && !m.email.toLowerCase().includes(q)) return false;
      }
      if (roleFilter !== 'all' && m.role !== roleFilter) return false;
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      return true;
    });
  }, [members, search, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="surface-card">
      <div className="flex flex-col gap-3 p-4 border-b border-border sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute w-4 h-4 -translate-y-1/2 pointer-events-none left-3 top-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name or email"
            aria-label="Search members"
            className="pl-9"
          />
        </div>

        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v ?? 'all'); setPage(1); }}>
          <SelectTrigger className="input-base sm:w-44">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {ASSIGNABLE_ROLES.map((role) => (
              <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? 'all'); setPage(1); }}>
          <SelectTrigger className="input-base sm:w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="invited">Invited</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="p-8">
          <EmptyState title="No members match your filters" description="Try adjusting your search or filters." />
        </div>
      ) : (
        <table className="table-enterprise">
          <thead>
            <tr>
              <th scope="col">Member</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Joined</th>
              {canManage && <th scope="col" className="text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {paged.map((member) => (
              <tr key={member.userId}>
                <td>
                  <div className="flex items-center gap-2.5">
                    <span className="flex items-center justify-center w-8 h-8 text-xs font-semibold rounded-full shrink-0 bg-primary/10 text-primary">
                      {getInitials(member.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium truncate text-foreground">{member.name}</div>
                      <div className="truncate text-caption text-muted-foreground">{member.email}</div>
                    </div>
                  </div>
                </td>
                <td>{getRoleLabel(member.role)}</td>
                <td>
                  <Badge variant={STATUS_VARIANT[member.status]} className="capitalize">
                    {member.status}
                  </Badge>
                </td>
                <td className="text-caption text-muted-foreground">
                  {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : '—'}
                </td>
                {canManage && (
                  <td className="text-right">
                    <MemberRowActions
                      organizationId={organizationId}
                      member={member}
                      onEditRole={setEditingMember}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between p-3 border-t border-border">
          <span className="text-caption text-muted-foreground">
            Page {page} of {totalPages} &middot; {filtered.length} member{filtered.length === 1 ? '' : 's'}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      <EditMemberRoleDialog
        organizationId={organizationId}
        member={editingMember}
        onClose={() => setEditingMember(null)}
      />
    </div>
  );
}