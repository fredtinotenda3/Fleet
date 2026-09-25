// frontend/modules/transport-cost/components/DimensionDrillDownDialog.tsx
//
// GAP-CLOSURE PASS, Objective 4 ("Command Centre Slice B/C" --
// drill-down/evidence). Generalizes VehicleDrillDownDialog's pattern to
// any Command Centre metric: a byCompany/byCategory/byTransporter/
// byDestination/byCustomer bar, or an unconstrained trend-chart point.
// Kept as a SEPARATE component from VehicleDrillDownDialog rather than
// replacing it -- that dialog's own endpoint (getPostingsForVehicle)
// returns every reversal alongside its posting (append-only ledger
// detail); this one is the read-only EVIDENCE view (one row per
// in-scope operation) the milestone's traceability requirement asks
// for. Both are additive, neither replaces the other's existing,
// already-tested behaviour.
//
// EVIDENCE/TRACEABILITY CHAIN: each row links to
// /transport-cost/operations/:id, which already shows the ledger
// posting history (Phase O4) AND the audit-history section (Objective
// 1) -- so "Command Centre metric -> operation/source record ->
// financial posting -> audit history" is closed by composition, not by
// a second evidence viewer. Links open in a new tab deliberately: the
// Command Centre's filters are local component state, not URL-synced,
// so an in-place navigation would lose them on return -- opening in a
// new tab keeps the dashboard (and its active filters) exactly as the
// user left it.

'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/frontend/shared/ui/feedback/dialog';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { ExternalLink, Inbox } from 'lucide-react';
import { formatDate } from '@/shared/utils/date.utils';
import { formatMoney } from '@/frontend/modules/finance/utils/money.utils';
import { useCommandCentreDrillDown } from '../hooks/useTransportCost';
import { COST_FACING_COMPANIES } from '../types';
import type { CommandCentreDrillDownDimension, CommandCentreFilters } from '../types';

interface DimensionDrillDownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  periodStart: Date;
  periodEnd: Date;
  filters: CommandCentreFilters;
  /** Omitted for an unconstrained (trend-point) drill-down -- see the hook/service's own header. */
  constraint?: { dimension: CommandCentreDrillDownDimension; key: string };
}

function companyLabel(value: string | null): string {
  if (!value) return 'Unattributed';
  return COST_FACING_COMPANIES.find((c) => c.value === value)?.label ?? value;
}

export function DimensionDrillDownDialog({
  open,
  onOpenChange,
  title,
  periodStart,
  periodEnd,
  filters,
  constraint,
}: DimensionDrillDownDialogProps) {
  const { data, isLoading, isError, error } = useCommandCentreDrillDown(open, periodStart, periodEnd, filters, constraint);

  const totalLine = data?.totals
    .map((t) => formatMoney(t.netReportingAmount, t.reportingCurrency))
    .join(' + ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{data?.label ? `${title} — ${data.label}` : title}</DialogTitle>
          <DialogDescription>
            {formatDate(periodStart)} – {formatDate(periodEnd)}
            {totalLine ? ` · ${totalLine} across ${data?.rowCount ?? 0} operation${data?.rowCount === 1 ? '' : 's'}` : ''}
            {data?.truncated ? ` · showing the first ${data.rows.length} of ${data.rowCount}` : ''}
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="py-8 text-sm text-center text-muted-foreground">Loading&hellip;</p>}
        {isError && (
          <p className="py-8 text-sm text-center text-destructive">
            {error instanceof Error ? error.message : "Couldn't load this evidence. Try again."}
          </p>
        )}

        {data && !isLoading && !isError && (
          <div className="overflow-x-auto border rounded-md border-border max-h-[60vh]">
            {data.rows.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={<Inbox className="h-8 w-8" aria-hidden="true" />}
                  title="No operations here"
                  description="No transport-cost operations back this figure for the selected period and filters."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Transporter</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.postingId}>
                      <TableCell>{formatDate(row.date)}</TableCell>
                      <TableCell>{row.registration}</TableCell>
                      <TableCell>{row.transporterName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{companyLabel(row.costFacingCompany)}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate" title={row.destinationTown}>
                        {row.destinationTown ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate" title={row.customerName}>
                        {row.customerName ?? '—'}
                      </TableCell>
                      <TableCell className="font-medium text-right">{formatMoney(row.reportingAmount, row.reportingCurrency)}</TableCell>
                      <TableCell>
                        <a
                          href={`/transport-cost/operations/${row.sourceRecordId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-primary hover:underline"
                          title="Open this operation — posting history and audit history"
                        >
                          <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Open operation</span>
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
