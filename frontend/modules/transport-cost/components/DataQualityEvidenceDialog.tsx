// frontend/modules/transport-cost/components/DataQualityEvidenceDialog.tsx
//
// GAP-CLOSURE PASS, Objective 4 ("a fuller data-quality table making
// actionable exceptions visible... with navigation from exception ->
// operation/source record -> review/correct where existing workflows
// support it"). The evidence rows behind one trust-panel count --
// clicking "Unresolved transporter: 4" opens this dialog listing those
// exact 4 rows (never a different 4 -- see
// TransportCostSourceRecordRepository.findByDataQualityIssue's own
// header for why the count and this list can never disagree).
//
// Each row links to the operation detail page, where the SAME
// EditRecordDialog used throughout the transport-cost module (Objective
// 2's field-coverage work) can correct the underlying transporter/
// vehicle/company/customer/destination -- no new correction UI is built
// here, per the reuse-not-duplicate mandate.

'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/frontend/shared/ui/feedback/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { ExternalLink, CheckCircle2 } from 'lucide-react';
import { useDataQualityIssueEvidence } from '../hooks/useTransportCost';
import type { DataQualityIssueKind } from '../types';

const ISSUE_TITLES: Record<DataQualityIssueKind, string> = {
  missingCostFacingCompany: 'Missing cost-facing company',
  missingRegistration: 'Missing registration',
  unresolvedVehicle: 'Unresolved vehicle',
  vehicleNotApplicable: 'Vehicle: not applicable',
  unresolvedTransporter: 'Unresolved transporter',
  missingCustomer: 'Missing customer',
  missingDestination: 'Missing destination',
  destinationNotApplicable: 'Destination: not applicable',
  missingTonnage: 'Missing tonnage',
};

interface DataQualityEvidenceDialogProps {
  issue: DataQualityIssueKind | null;
  periodStart: Date;
  periodEnd: Date;
  onOpenChange: (open: boolean) => void;
}

export function DataQualityEvidenceDialog({ issue, periodStart, periodEnd, onOpenChange }: DataQualityEvidenceDialogProps) {
  const { data, isLoading, isError, error } = useDataQualityIssueEvidence(issue, periodStart, periodEnd);

  return (
    <Dialog open={Boolean(issue)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{issue ? ISSUE_TITLES[issue] : 'Exceptions'}</DialogTitle>
          <DialogDescription>
            {data
              ? `${data.rowCount} row${data.rowCount === 1 ? '' : 's'}${
                  data.truncated ? ` (showing the first ${data.rows.length})` : ''
                } -- open a row to review or correct it.`
              : 'Loading the rows behind this count.'}
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
                  icon={<CheckCircle2 className="h-8 w-8" aria-hidden="true" />}
                  title="Nothing to review"
                  description="No rows currently have this issue for the selected period."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Source file / row</TableHead>
                    <TableHead>Registration (raw)</TableHead>
                    <TableHead>Transporter (raw)</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.sourceRecordId}>
                      <TableCell>{row.rawDate || '—'}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={row.sourceFileName}>
                        {row.sourceFileName} #{row.sourceRowNumber}
                      </TableCell>
                      <TableCell>{row.registrationRaw || '—'}</TableCell>
                      <TableCell>{row.transporterRaw || '—'}</TableCell>
                      <TableCell className="max-w-[140px] truncate" title={row.customerName}>
                        {row.customerName ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate" title={row.destinationTown}>
                        {row.destinationTown ?? '—'}
                      </TableCell>
                      <TableCell>
                        <a
                          href={`/transport-cost/operations/${row.sourceRecordId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-primary hover:underline"
                          title="Open this operation to review or correct it"
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
