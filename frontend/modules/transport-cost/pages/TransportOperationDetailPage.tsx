// frontend/modules/transport-cost/pages/TransportOperationDetailPage.tsx
//
// OLIVINE LIVE OPERATING MODEL, SLICE 5, task #61. One transport
// operation's full picture: header, its load(s) (no fabricated per-line
// cost -- see TransportCostLine's own doc comment and the O1 audit's
// "operational record vs ledger posting" distinction), the financial
// section (current field values + the FULL posting history: original,
// any reversal, any correction -- never collapsed to one row, mirroring
// VehicleDrillDownDialog's own "a correction shows as two lines" rule),
// and row actions reused verbatim from the operational table so the
// same state/permission gating applies here too.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { formatDate } from '@/shared/utils/date.utils';
import { formatMoney } from '@/frontend/modules/finance/utils/money.utils';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { Permission, permissionService } from '@/server/permissions/roles';
import { useOperationalRecord } from '../hooks/useTransportCost';
import {
  useEditSourceRecord,
  useCorrectPostedSourceRecord,
  useCancelSourceRecord,
  useDuplicateSourceRecord,
} from '../hooks/useTransportCostMutations';
import { StatusBadge } from '../components/StatusBadge';
import { RecordActionsMenu } from '../components/RecordActionsMenu';
import { EditRecordDialog, type EditRecordDialogMode } from '../components/EditRecordDialog';
import { AuditHistorySection } from '../components/AuditHistorySection';
import type { SourceRecordPatch } from '../types';

interface TransportOperationDetailPageProps {
  sourceRecordId: string;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-body-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right text-foreground">{value}</span>
    </div>
  );
}

export function TransportOperationDetailPage({ sourceRecordId }: TransportOperationDetailPageProps) {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canNormalize = permissionService.hasPermission(roles, Permission.TRANSPORT_COST_NORMALIZE);
  const canManageFinance = permissionService.hasPermission(roles, Permission.FINANCE_MANAGE);

  const { data: view, isLoading, isError, refetch } = useOperationalRecord(sourceRecordId);
  const editRecord = useEditSourceRecord();
  const correctRecord = useCorrectPostedSourceRecord();
  const cancelRecord = useCancelSourceRecord();
  const duplicateRecord = useDuplicateSourceRecord();

  const [dialogMode, setDialogMode] = useState<EditRecordDialogMode | null>(null);

  if (isLoading) return <PageLoader label="Loading transport operation" />;

  if (isError || !view) {
    return (
      <EmptyState
        title="Transport operation not found"
        description="This record may have been removed, or you don't have access to it."
        action={{ label: 'Back to import', onClick: () => router.push('/transport-cost/import') }}
      />
    );
  }

  const { source, status, livePosting, postingHistory } = view;
  const loads = source.lines && source.lines.length > 0 ? source.lines : null;

  async function handleEditSubmit(patch: SourceRecordPatch) {
    if (dialogMode === 'edit') {
      await editRecord.mutateAsync({ sourceRecordId, patch });
    } else {
      await correctRecord.mutateAsync({ sourceRecordId, patch });
    }
    setDialogMode(null);
    void refetch();
  }

  async function handleCancel() {
    const consequence =
      status === 'posted'
        ? 'This record is already posted -- cancelling it will reverse its ledger entry. This cannot be undone.'
        : 'This record has not been posted yet -- cancelling it just marks it as not-to-be-posted.';
    const reason = window.prompt(`${consequence}\n\nEnter a reason to cancel this record:`);
    if (reason === null) return;
    if (!reason.trim()) {
      window.alert('A reason is required to cancel a record.');
      return;
    }
    await cancelRecord.mutateAsync({ sourceRecordId, reason: reason.trim() });
    void refetch();
  }

  async function handleDuplicate() {
    const duplicate = await duplicateRecord.mutateAsync(sourceRecordId);
    if (duplicate._id) router.push(`/transport-cost/operations/${duplicate._id}`);
  }

  const isSubmitting = editRecord.isPending || correctRecord.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Transport operation · Row ${source.sourceRowNumber}`}
        description={`${source.sourceFileName}${source.sourceSheetName ? ` · ${source.sourceSheetName}` : ''}`}
        breadcrumbs={[
          { label: 'Transport cost' },
          { label: 'Import', href: '/transport-cost/import' },
          { label: `Row ${source.sourceRowNumber}` },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/transport-cost/import')}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
            <RecordActionsMenu
              status={status}
              permissions={{ canNormalize, canManageFinance }}
              onEdit={() => setDialogMode('edit')}
              onCorrect={() => setDialogMode('correct')}
              onCancel={handleCancel}
              onDuplicate={handleDuplicate}
            />
          </div>
        }
      />

      <Card>
        <CardContent className="flex flex-col items-start justify-between gap-4 py-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-caption text-muted-foreground">
              {status === 'posted' && livePosting ? 'Currently posted' : 'Current amount'}
            </p>
            <p className="mt-1 text-display tabular-nums text-foreground">
              {source.amount === null
                ? '—'
                : formatMoney(livePosting?.reportingAmount ?? source.amount, livePosting?.reportingCurrency ?? source.currency ?? 'USD')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
            <Badge variant="outline">{source.sheetFamily}</Badge>
            {source.registration && <Badge variant="outline">{source.registration}</Badge>}
          </div>
        </CardContent>
      </Card>

      {source.cancelledAt && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-body-sm">
            <span className="font-medium text-destructive">Cancelled</span> by {source.cancelledBy ?? 'unknown'} on{' '}
            {formatDate(source.cancelledAt)}
            {source.cancelReason ? ` -- "${source.cancelReason}"` : ''}
          </CardContent>
        </Card>
      )}

      {source.duplicatedFromId && (
        <Card>
          <CardContent className="py-4 text-body-sm text-muted-foreground">
            Duplicated from{' '}
            <a className="text-primary hover:underline" href={`/transport-cost/operations/${source.duplicatedFromId}`}>
              another record
            </a>
            .
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Operation overview</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            <DetailRow label="Date" value={source.date ? formatDate(source.date) : '—'} />
            <DetailRow label="Registration" value={source.registration ?? '—'} />
            <DetailRow label="Transporter" value={source.transporterNormalized ?? '—'} />
            <DetailRow label="Cost-facing company" value={source.costFacingCompany ?? '—'} />
            <DetailRow label="Customer" value={source.customerName ?? '—'} />
            <DetailRow label="Destination" value={source.destinationTown ?? '—'} />
            <DetailRow label="Sales invoice no" value={source.salesInvoiceNo ?? '—'} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Provenance</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            <DetailRow label="Source file" value={source.sourceFileName} />
            <DetailRow label="Sheet" value={source.sourceSheetName ?? '—'} />
            <DetailRow label="Row number" value={String(source.sourceRowNumber)} />
            <DetailRow label="Imported" value={formatDate(source.importedAt)} />
            <DetailRow label="Import batch" value={source.importBatchId} />
          </CardContent>
        </Card>
      </div>

      {loads && (
        <Card>
          <CardHeader><CardTitle>Loads on this operation ({loads.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto border rounded-md border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Consignment</TableHead>
                    <TableHead className="text-right">Tonnage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loads.map((line) => (
                    <TableRow key={line.lineNumber}>
                      <TableCell>{line.lineNumber}</TableCell>
                      <TableCell>{line.customerName ?? '—'}</TableCell>
                      <TableCell>{line.destinationTown ?? '—'}</TableCell>
                      <TableCell>{line.salesInvoiceNo ?? '—'}</TableCell>
                      <TableCell>{line.consignmentNumber ?? '—'}</TableCell>
                      <TableCell className="text-right">{line.tonnageRaw ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Ledger posting history ({postingHistory.length})</CardTitle></CardHeader>
        <CardContent>
          {postingHistory.length === 0 ? (
            <p className="py-6 text-center text-body-sm text-muted-foreground">
              Never posted to the finance ledger.
            </p>
          ) : (
            <div className="overflow-x-auto border rounded-md border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Posted</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...postingHistory]
                    .sort((a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime())
                    .map((posting) => (
                      <TableRow key={posting._id} className={livePosting?._id === posting._id ? 'bg-emerald-500/5' : undefined}>
                        <TableCell>{formatDate(posting.postedAt)}</TableCell>
                        <TableCell className={`text-right font-medium tabular-nums ${posting.amount < 0 ? 'text-warning' : ''}`}>
                          {formatMoney(posting.amount, posting.currency)}
                        </TableCell>
                        <TableCell>
                          {posting.reversalOfPostingId ? (
                            <Badge variant="destructive">Reversal</Badge>
                          ) : livePosting?._id === posting._id ? (
                            <Badge variant="outline" className="border-emerald-600 text-emerald-700 dark:text-emerald-400">
                              Live
                            </Badge>
                          ) : (
                            <Badge variant="outline">Original</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{posting.postedBy}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Audit history</CardTitle></CardHeader>
        <CardContent>
          <AuditHistorySection sourceRecordId={source._id!} />
        </CardContent>
      </Card>

      <EditRecordDialog
        open={dialogMode !== null}
        mode={dialogMode ?? 'edit'}
        record={source}
        isPosted={status === 'posted'}
        isSubmitting={isSubmitting}
        onOpenChange={(open) => setDialogMode(open ? dialogMode : null)}
        onSubmit={handleEditSubmit}
      />
    </div>
  );
}
