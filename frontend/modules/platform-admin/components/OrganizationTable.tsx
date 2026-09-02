// frontend/modules/platform-admin/components/OrganizationTable.tsx
'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import type { PlatformOrganization } from '../types';
import { PLATFORM_ADMIN_ROUTES } from '../routes';
import {
  formatDate,
  formatSeats,
  organizationRouteId,
  organizationStatusLabel,
  organizationStatusPresentation,
  organizationTierLabel,
  tenantIdentifier,
} from '../utils/platform-admin.utils';

interface OrganizationTableProps {
  organizations: readonly PlatformOrganization[];
}

/**
 * Presentational only -- every value shown is derived by a pure helper
 * in ../utils, which is where the behaviour is tested (this repo's Jest
 * runs without jsdom, so a component cannot be rendered in a test).
 */
export function OrganizationTable({ organizations }: OrganizationTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Organization</TableHead>
            <TableHead>Tenant ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Seats</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Open</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {organizations.map((org) => {
            const presentation = organizationStatusPresentation(org.status);
            const tenant = tenantIdentifier(org);
            const href = PLATFORM_ADMIN_ROUTES.organizationDetail(organizationRouteId(org));

            return (
              <TableRow key={String(org._id ?? tenant ?? org.name)}>
                <TableCell className="font-medium text-foreground">
                  <Link href={href} className="hover:underline">
                    {org.name}
                  </Link>
                </TableCell>
                <TableCell>
                  {/*
                    The SLUG is the canonical tenantId in this database
                    (OrganizationService writes `tenantId: slug`), and it
                    is the value that appears on every business row -- so
                    it is shown as a copyable monospace string rather than
                    prose. A blank here means neither field was present,
                    which is a data problem worth seeing.
                  */}
                  {tenant ? (
                    <code className="text-body-sm text-muted-foreground">{tenant}</code>
                  ) : (
                    <span className="text-body-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={presentation.badgeVariant} className="gap-1">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${presentation.dotClassName}`}
                      aria-hidden="true"
                    />
                    {organizationStatusLabel(org.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-body-sm text-muted-foreground">
                  {organizationTierLabel(org.subscription?.tier)}
                </TableCell>
                <TableCell className="text-body-sm text-muted-foreground">
                  {formatSeats(org.subscription)}
                </TableCell>
                <TableCell className="text-body-sm text-muted-foreground">
                  {formatDate(org.createdAt as unknown as string)}
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={href}
                    className="inline-flex items-center gap-1 text-body-sm text-primary hover:underline"
                    aria-label={`Open ${org.name}`}
                  >
                    Open
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
