// frontend/modules/platform-admin/components/UserDirectoryTable.tsx
'use client';

import Link from 'next/link';
import { MailPlus } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import type { DirectoryUser } from '../types';
import { PLATFORM_ADMIN_ROUTES } from '../routes';
import { formatDate } from '../utils/platform-admin.utils';
import {
  memberStatusLabel,
  memberStatusPresentation,
  roleLabel,
} from '../utils/platform-access.utils';

interface UserDirectoryTableProps {
  users: readonly DirectoryUser[];
}

/**
 * Presentational only -- every value shown is derived by a pure helper
 * in ../utils, which is where the behaviour is tested (this repo's Jest
 * runs without jsdom, so a component cannot be rendered in a test).
 *
 * NO ACTIONS COLUMN. Member writes are offered only on the organization
 * detail page, where the caller's own tenant can be compared against
 * the organization being viewed. A row here spans every organization on
 * the current page, so a "suspend" button would have to act on tenants
 * the caller does not own -- see canManageMembersFor() and constraint 3
 * in ../types/access.types.ts. The organization link is the route to
 * acting on someone.
 */
export function UserDirectoryTable({ users }: UserDirectoryTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Organization</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Joined</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const presentation = memberStatusPresentation(user.status);
            const href = user.organizationId
              ? PLATFORM_ADMIN_ROUTES.organizationDetail(
                  user.organizationTenantId ?? user.organizationId
                )
              : null;

            return (
              <TableRow
                key={
                  // A pending invite has no userId, so the email keys it
                  // within its organization. The invite TOKEN is never
                  // used here: it is a credential that grants access to
                  // whoever holds it and must not reach the DOM.
                  user.isPendingInvite
                    ? `${user.organizationId}:invite:${user.email}`
                    : `${user.organizationId}:${user.userId}`
                }
              >
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">
                      {user.name || <span className="text-muted-foreground">No name recorded</span>}
                    </span>
                    <span className="text-body-sm text-muted-foreground">{user.email || '—'}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {href ? (
                    <Link href={href} className="text-body-sm hover:underline">
                      {user.organizationName}
                    </Link>
                  ) : (
                    <span className="text-body-sm">{user.organizationName}</span>
                  )}
                  {user.organizationTenantId && (
                    <div>
                      <code className="text-caption text-muted-foreground">
                        {user.organizationTenantId}
                      </code>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-body-sm">{roleLabel(user.role)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={presentation.badgeVariant} className="gap-1">
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${presentation.dotClassName}`}
                        aria-hidden="true"
                      />
                      {memberStatusLabel(user.status)}
                    </Badge>
                    {/*
                      A pending invite is NOT a member record -- there is
                      no account behind it yet. Marking it keeps the
                      directory honest about which rows are people who
                      can sign in and which are invitations outstanding.
                    */}
                    {user.isPendingInvite && (
                      <span
                        className="inline-flex items-center gap-1 text-caption text-muted-foreground"
                        title="Invitation sent; no account exists yet"
                      >
                        <MailPlus className="size-3" aria-hidden="true" />
                        Invite
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-body-sm text-muted-foreground">
                  {formatDate(user.joinedAt)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
