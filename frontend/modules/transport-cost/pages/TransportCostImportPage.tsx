// frontend/modules/transport-cost/pages/TransportCostImportPage.tsx
//
// Phase O1's only UI surface: import the two stable Olivine sheet
// families (Third Party, Vansales) and verify the rows landed --
// nothing here computes a cost, a total, or a per-tonne figure. See the
// backend module's header comments for why that line is not crossed.

'use client';

import { useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { describeQueryError } from '@/frontend/shared/ui/patterns';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Separator } from '@/frontend/shared/ui/data-display/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { ImportModal, type ImportColumnDef, type ImportResponse } from '@/frontend/shared/import/ImportModal';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { Permission, permissionService } from '@/server/permissions/roles';
import { transportCostApi } from '../services/transport-cost.api';
import { useTransportCostSourceRecords } from '../hooks/useTransportCost';
import type { TransportCostSheetFamily } from '@/shared/types/transport-cost.types';

const THIRD_PARTY_COLUMNS: ImportColumnDef[] = [
  { key: 'date', label: 'Date', required: true, type: 'string', example: '05.01.26' },
  { key: 'customerName', label: 'Customer name', required: false, type: 'string', example: 'Olivine' },
  { key: 'transporter', label: 'Transporter', required: false, type: 'string', example: 'PRINORTH' },
  { key: 'salesInvoiceNo', label: 'Sales invoice no', required: false, type: 'string', example: 'INV-1024' },
  { key: 'tonnage', label: 'Tonnage', required: false, type: 'number', example: '32' },
  { key: 'registration', label: 'Truck registration no', required: true, type: 'string', example: 'AGL8230' },
  { key: 'destinationTown', label: 'Destination Town', required: false, type: 'string', example: 'Bulawayo' },
  { key: 'amount', label: 'Amount', required: false, type: 'number', example: '4500.00' },
];

const VANSALES_COLUMNS: ImportColumnDef[] = [
  { key: 'payerName', label: 'Payer name', required: true, type: 'string', example: 'Mr Gurjit' },
  { key: 'registration', label: 'REG', required: false, type: 'string', example: 'AGL8230' },
  { key: 'tonnage', label: 'Tonnage', required: false, type: 'number', example: '8' },
  { key: 'product', label: 'Product', required: false, type: 'string', example: 'Golden Glow 2L' },
  { key: 'truck', label: 'TRUCK (transporter)', required: true, type: 'string', example: 'SIGHTSCORE' },
  { key: 'monthlyCostBeforeVat', label: 'Monthly cost before VAT', required: false, type: 'number', example: '1200.00' },
  { key: 'week1', label: 'WEEK1', required: false, type: 'number', example: '300.00' },
  { key: 'week2', label: 'WEEK2', required: false, type: 'number', example: '300.00' },
  { key: 'week3', label: 'WEEK3', required: false, type: 'number', example: '300.00' },
  { key: 'week4', label: 'WEEK4', required: false, type: 'number', example: '300.00' },
  { key: 'total', label: 'TOTAL', required: false, type: 'number', example: '1200.00' },
];

const PAGE_SIZE = 20;

function familyLabel(family: TransportCostSheetFamily): string {
  return family === 'third-party' ? '3rd Party' : 'Vansales';
}

export function TransportCostImportPage() {
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canImport = permissionService.hasPermission(roles, Permission.TRANSPORT_COST_IMPORT);

  const [thirdPartyModalOpen, setThirdPartyModalOpen] = useState(false);
  const [vansalesModalOpen, setVansalesModalOpen] = useState(false);
  const [familyFilter, setFamilyFilter] = useState<TransportCostSheetFamily | undefined>(undefined);
  const [page, setPage] = useState(1);

  const { data: result, isLoading, isError, error, refetch } = useTransportCostSourceRecords({
    sheetFamily: familyFilter,
    page,
    limit: PAGE_SIZE,
  });

  async function handleThirdPartyImport(
    records: Array<Record<string, unknown>>,
    fileName: string
  ): Promise<ImportResponse> {
    return transportCostApi.importThirdParty(records, fileName || 'unknown.csv');
  }

  async function handleVansalesImport(
    records: Array<Record<string, unknown>>,
    fileName: string
  ): Promise<ImportResponse> {
    return transportCostApi.importVansales(records, fileName || 'unknown.csv');
  }

  function handleImportComplete(response: ImportResponse) {
    // The backend's actual result carries a `summary.duplicates` count
    // that ImportResponse's narrower type doesn't declare -- read it
    // defensively rather than widening the shared ImportModal type for
    // one caller.
    const duplicates = (response.summary as unknown as { duplicates?: number })?.duplicates ?? 0;
    if (duplicates > 0) {
      toast.info(
        `${duplicates} row${duplicates === 1 ? '' : 's'} looked like a duplicate of an existing record and ${duplicates === 1 ? 'was' : 'were'} not imported. See the failed-rows list for details.`
      );
    }
    void refetch();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transport cost import"
        description="Import Olivine's 3rd Party and Vansales transport-cost spreadsheets as source evidence. This does not post to the finance ledger or compute cost per tonne -- see the fit-gap assessment for why."
        breadcrumbs={[{ label: 'Transport cost' }, { label: 'Import' }]}
        actions={
          canImport ? (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setThirdPartyModalOpen(true)}>
                <UploadCloud className="h-3.5 w-3.5" />
                Import 3rd Party
              </Button>
              <Button size="sm" variant="outline" onClick={() => setVansalesModalOpen(true)}>
                <UploadCloud className="h-3.5 w-3.5" />
                Import Vansales
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="p-4 space-y-4 surface-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="font-medium text-body-sm text-foreground">Imported source records</p>
            <span className="text-caption text-muted-foreground">
              Source evidence only -- not yet financial truth.
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant={familyFilter === undefined ? 'default' : 'outline'}
              onClick={() => {
                setFamilyFilter(undefined);
                setPage(1);
              }}
            >
              All
            </Button>
            <Button
              size="sm"
              variant={familyFilter === 'third-party' ? 'default' : 'outline'}
              onClick={() => {
                setFamilyFilter('third-party');
                setPage(1);
              }}
            >
              3rd Party
            </Button>
            <Button
              size="sm"
              variant={familyFilter === 'vansales' ? 'default' : 'outline'}
              onClick={() => {
                setFamilyFilter('vansales');
                setPage(1);
              }}
            >
              Vansales
            </Button>
          </div>
        </div>

        <Separator />

        {isError && (
          <div className="p-4 text-center text-body-sm text-destructive">
            {describeQueryError(error)}
            <div className="mt-2">
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          </div>
        )}

        {!isError && (
          <div className="overflow-x-auto border rounded-md border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Family</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Registration</TableHead>
                  <TableHead>Transporter</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Source file</TableHead>
                  <TableHead>Imported</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Loading&hellip;
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && (result?.data.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      No source records imported yet.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading &&
                  result?.data.map((record) => (
                    <TableRow key={record._id}>
                      <TableCell>{record.sourceRowNumber}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{familyLabel(record.sheetFamily)}</Badge>
                      </TableCell>
                      <TableCell>{record.date ? new Date(record.date).toLocaleDateString() : '—'}</TableCell>
                      <TableCell>{record.registration ?? '—'}</TableCell>
                      <TableCell>{record.transporterNormalized ?? '—'}</TableCell>
                      <TableCell>{record.amount === null ? '—' : record.amount.toLocaleString()}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={record.sourceFileName}>
                        {record.sourceFileName}
                      </TableCell>
                      <TableCell>{new Date(record.importedAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}

        {result && result.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-caption text-muted-foreground">
              Page {result.pagination.page} of {result.pagination.totalPages} &middot; {result.pagination.total} record(s)
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={!result.pagination.hasPrev} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={!result.pagination.hasNext} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <ImportModal
        open={thirdPartyModalOpen}
        onOpenChange={setThirdPartyModalOpen}
        title="Import 3rd Party transport cost"
        description="Upload Olivine's '3rd Party' or 'Depot STO' sheet. Download the template below to see the expected columns."
        columns={THIRD_PARTY_COLUMNS}
        onImport={handleThirdPartyImport}
        onImportComplete={handleImportComplete}
      />

      <ImportModal
        open={vansalesModalOpen}
        onOpenChange={setVansalesModalOpen}
        title="Import Vansales transport cost"
        description="Upload Olivine's 'Vansales' sheet. Download the template below to see the expected columns."
        columns={VANSALES_COLUMNS}
        onImport={handleVansalesImport}
        onImportComplete={handleImportComplete}
      />
    </div>
  );
}
