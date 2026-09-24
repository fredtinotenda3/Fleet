// frontend/modules/transport-cost/pages/TransportCostImportPage.tsx
//
// Phase O1's UI surface: import Olivine's four sheet families (3rd
// Party, Vansales, Swift, Depot STO) and verify the rows landed --
// nothing here computes a cost, a total, or a per-tonne figure. See the
// backend module's header comments for why that line is not crossed.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UploadCloud, PenLine } from 'lucide-react';
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
import { ManualEntryModal } from '@/frontend/shared/import/ManualEntryModal';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { Permission, permissionService } from '@/server/permissions/roles';
import { transportCostApi } from '../services/transport-cost.api';
import { useTransportCostSourceRecords } from '../hooks/useTransportCost';
import type { TransportCostSheetFamily } from '@/shared/types/transport-cost.types';
import { COST_FACING_COMPANIES } from '@/shared/types/cost-facing-company.types';

// OLIVINE LIVE OPERATING MODEL, item 2/3/5: required on every entry path
// (manual and bulk), for all four sheet families -- see
// shared/types/cost-facing-company.types.ts's header for why this is a
// proper closed-set dropdown, never free text, and why it is captured
// per row rather than derived from a sheet name later. Reused as one
// column definition object across all four families' column lists below
// so the label/options never drift between them.
const COST_FACING_COMPANY_COLUMN: ImportColumnDef = {
  key: 'costFacingCompany',
  label: 'Cost-facing company',
  required: true,
  type: 'select',
  example: 'Olivine',
  description: 'Which of Hypery, Olivine, or Surface this cost was incurred facing.',
  options: COST_FACING_COMPANIES,
};

// Bulk file upload's column set -- UNCHANGED by Slice 2, per its own
// instruction not to invent a bulk multi-line convention. ImportModal
// (the file-upload path) always uses this exact list; a two-invoice
// truck trip in a bulk file still lands as two ordinary rows, exactly
// as it did before this slice -- see OLIVINE_LIVE_OPERATING_MODEL_
// GAP_ANALYSIS.md Section 5 for why no reliable in-file signal exists
// to group rows into one operation.
const THIRD_PARTY_COLUMNS: ImportColumnDef[] = [
  { key: 'date', label: 'Date', required: true, type: 'string', example: '05.01.26' },
  COST_FACING_COMPANY_COLUMN,
  { key: 'customerName', label: 'Customer name', required: false, type: 'string', example: 'Olivine' },
  { key: 'transporter', label: 'Transporter', required: false, type: 'string', example: 'PRINORTH' },
  { key: 'salesInvoiceNo', label: 'Sales invoice no', required: false, type: 'string', example: 'INV-1024' },
  { key: 'tonnage', label: 'Tonnage', required: false, type: 'number', example: '32' },
  { key: 'registration', label: 'Truck registration no', required: true, type: 'string', example: 'AGL8230' },
  { key: 'destinationTown', label: 'Destination Town', required: false, type: 'string', example: 'Bulawayo' },
  { key: 'amount', label: 'Amount', required: false, type: 'number', example: '4500.00' },
];

// OLIVINE LIVE OPERATING MODEL, SLICE 2 (item 6/7). Manual-entry-ONLY
// split of THIRD_PARTY_COLUMNS above into what the backend now treats
// as parent-level (one truck/transporter/date/cost per transport
// OPERATION) versus line-level (one invoice/customer/consignment/
// destination/tonnage per LOAD within that operation) -- see
// TransportCostSourceRecord.lines and RawTransportCostLineInput's own
// doc comments for the exact contract this mirrors. THIRD_PARTY_COLUMNS
// itself is untouched, so the bulk file-upload modal's columns,
// template, and behaviour are byte-for-byte unchanged.
const THIRD_PARTY_PARENT_COLUMNS: ImportColumnDef[] = [
  { key: 'date', label: 'Date', required: true, type: 'string', example: '05.01.26' },
  COST_FACING_COMPANY_COLUMN,
  { key: 'transporter', label: 'Transporter', required: false, type: 'string', example: 'PRINORTH' },
  { key: 'registration', label: 'Truck registration no', required: true, type: 'string', example: 'AGL8230' },
  { key: 'amount', label: 'Amount (for the whole trip -- never per line)', required: false, type: 'number', example: '4500.00' },
];

// Field keys here must match RawTransportCostLineInput exactly (see
// import-transport-cost.command.ts) -- consignmentNumber is genuinely
// new (no scalar equivalent existed pre-Slice-2); the rest mirror
// THIRD_PARTY_COLUMNS' former customerName/salesInvoiceNo/tonnage/
// destinationTown fields, now scoped to one load instead of the whole
// operation.
const THIRD_PARTY_LINE_COLUMNS: ImportColumnDef[] = [
  { key: 'customerName', label: 'Customer name', required: false, type: 'string', example: 'Olivine' },
  { key: 'salesInvoiceNo', label: 'Sales invoice no', required: false, type: 'string', example: 'INV-1024' },
  { key: 'consignmentNumber', label: 'Consignment number', required: false, type: 'string', example: 'CN-10234' },
  { key: 'destinationTown', label: 'Destination Town', required: false, type: 'string', example: 'Bulawayo' },
  { key: 'tonnage', label: 'Tonnage', required: false, type: 'number', example: '32' },
];

const VANSALES_COLUMNS: ImportColumnDef[] = [
  { key: 'payerName', label: 'Payer name', required: true, type: 'string', example: 'Mr Gurjit' },
  COST_FACING_COMPANY_COLUMN,
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

// Only consDate/consNumber are required -- see validateAndBuildSwift's
// header for why (one tolerant parser over a small required-column
// subset, not a parser per month; a schema-drifted optional column does
// not break import). Deliberately has no registration/transporter
// column: the real source data has none.
const SWIFT_COLUMNS: ImportColumnDef[] = [
  { key: 'consDate', label: 'Cons. date', required: true, type: 'string', example: '2026-01-05' },
  COST_FACING_COMPANY_COLUMN,
  { key: 'consNumber', label: 'Cons. Number', required: true, type: 'string', example: 'CN-10234' },
  { key: 'shipperReference', label: 'Shipper reference', required: false, type: 'string', example: 'SR-4471' },
  { key: 'receiversName', label: 'Receivers Name', required: false, type: 'string', example: 'Olivine' },
  { key: 'destinationLocation', label: 'Destination location', required: false, type: 'string', example: 'Bulawayo' },
  { key: 'actualWeight', label: 'Actual weight', required: false, type: 'number', example: '32' },
  { key: 'totalExcl', label: 'Total(Excl)', required: false, type: 'number', example: '3900.00' },
  { key: 'taxAmount', label: 'Tax amount', required: false, type: 'number', example: '600.00' },
  { key: 'totalIncl', label: 'Total(Incl)', required: false, type: 'number', example: '4500.00' },
];

// Only `date` is required -- see validateAndBuildDepotSto's header and
// DEPOT_STO_DECISION.md: six real months, four genuinely different
// column layouts, one tolerant parser over the union of every column
// seen. Every other field here is optional and simply absent for
// whichever month's sheet didn't carry it. `amount` covers three
// different literal source headers across the drift (Amount/COSTS/
// COST) -- see DepotStoImportRow's own doc comment. The three sign-off
// columns are raw provenance only; their real values are booleans, but
// nothing here assigns them meaning (see DepotStoSourceFields).
const DEPOT_STO_COLUMNS: ImportColumnDef[] = [
  { key: 'date', label: 'DATE', required: true, type: 'string', example: '05.03.26' },
  COST_FACING_COMPANY_COLUMN,
  { key: 'sto', label: 'STO', required: false, type: 'string', example: 'STO-1042' },
  { key: 'source', label: 'SOURCE', required: false, type: 'string', example: 'Harare' },
  { key: 'depot', label: 'DEPOT', required: false, type: 'string', example: 'Bulawayo' },
  { key: 'commodity', label: 'Commodity', required: false, type: 'string', example: 'Golden Glow 2L' },
  { key: 'customerName', label: 'Customer name', required: false, type: 'string', example: 'Olivine' },
  { key: 'transporter', label: 'Transporter', required: false, type: 'string', example: 'PRINORTH' },
  { key: 'salesInvoiceNo', label: 'Sales invoice no', required: false, type: 'string', example: 'INV-1024' },
  { key: 'tonnage', label: 'Tonnage', required: false, type: 'number', example: '32' },
  { key: 'registration', label: 'Truck registration no / REG', required: false, type: 'string', example: 'AGL8230' },
  { key: 'destinationTown', label: 'Destination Town', required: false, type: 'string', example: 'Bulawayo' },
  { key: 'driver', label: 'DRIVER', required: false, type: 'string', example: 'T. Moyo' },
  { key: 'toonnes', label: 'TOONNES', required: false, type: 'number', example: '15' },
  { key: 'amount', label: 'Amount / COSTS / COST', required: false, type: 'number', example: '4500.00' },
  { key: 'mrGurjit', label: 'Mr Gurjit', required: false, type: 'boolean', example: 'true' },
  { key: 'mrInderjeet', label: 'Mr Inderjeet', required: false, type: 'boolean', example: 'true' },
  { key: 'sharmaJi', label: 'Sharma Ji', required: false, type: 'boolean', example: 'true' },
  // May's sheet only -- five named per-product quantity columns that
  // can all be populated on one row at once, so (unlike every other
  // Depot STO column) none of these fold into a shared field. See
  // DepotStoSourceFields.mayProductQuantities' doc comment.
  { key: 'goldenGlow2L', label: 'Golden Glow 2L', required: false, type: 'number', example: '1600' },
  { key: 'olivine2L', label: 'Olivine 2L', required: false, type: 'number', example: '1200' },
  { key: 'puredrop2L', label: 'Puredrop 2L', required: false, type: 'number', example: '800' },
  { key: 'pureDrop5l', label: 'Pure drop 5l', required: false, type: 'number', example: '400' },
  { key: 'pureDrop750', label: 'Pure Drop 750', required: false, type: 'number', example: '600' },
];

const PAGE_SIZE = 20;

function familyLabel(family: TransportCostSheetFamily): string {
  switch (family) {
    case 'third-party':
      return '3rd Party';
    case 'vansales':
      return 'Vansales';
    case 'swift':
      return 'Swift';
    case 'depot-sto':
      return 'Depot STO';
    default:
      return family;
  }
}

export function TransportCostImportPage() {
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canImport = permissionService.hasPermission(roles, Permission.TRANSPORT_COST_IMPORT);

  const [thirdPartyModalOpen, setThirdPartyModalOpen] = useState(false);
  const [vansalesModalOpen, setVansalesModalOpen] = useState(false);
  const [swiftModalOpen, setSwiftModalOpen] = useState(false);
  const [depotStoModalOpen, setDepotStoModalOpen] = useState(false);
  // One-row manual entry -- the no-file alternative to the four modals
  // above. Same handlers, same API calls, see ManualEntryModal.tsx's header.
  const [thirdPartyManualOpen, setThirdPartyManualOpen] = useState(false);
  const [vansalesManualOpen, setVansalesManualOpen] = useState(false);
  const [swiftManualOpen, setSwiftManualOpen] = useState(false);
  const [depotStoManualOpen, setDepotStoManualOpen] = useState(false);
  const [familyFilter, setFamilyFilter] = useState<TransportCostSheetFamily | undefined>(undefined);
  const [page, setPage] = useState(1);
  // Vansales periodization Option A (VANSALES_PERIODIZATION_DECISION.md):
  // the calendar month this batch covers, declared explicitly by the
  // person importing -- never inferred from the file name or sheet tab.
  // Required before the Vansales import modal can even open.
  const [vansalesPeriodMonth, setVansalesPeriodMonth] = useState('');
  const vansalesPeriodMonthValid = /^\d{4}-(0[1-9]|1[0-2])$/.test(vansalesPeriodMonth);

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
    const response = await transportCostApi.importVansales(records, fileName || 'unknown.csv', vansalesPeriodMonth);
    // Reset after a successful import so the next batch can never
    // silently reuse a stale month -- the person must re-declare it
    // every time, the same discipline as sourceFileName.
    setVansalesPeriodMonth('');
    return response;
  }

  async function handleSwiftImport(
    records: Array<Record<string, unknown>>,
    fileName: string
  ): Promise<ImportResponse> {
    return transportCostApi.importSwift(records, fileName || 'unknown.csv');
  }

  async function handleDepotStoImport(
    records: Array<Record<string, unknown>>,
    fileName: string
  ): Promise<ImportResponse> {
    return transportCostApi.importDepotSto(records, fileName || 'unknown.csv');
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
        description="Import Olivine's 3rd Party, Vansales, Swift, and Depot STO transport-cost spreadsheets as source evidence. This does not post to the finance ledger or compute cost per tonne -- see the fit-gap assessment for why."
        breadcrumbs={[{ label: 'Transport cost' }, { label: 'Import' }]}
        actions={
          <div className="flex items-center gap-2">
            {canImport && (
              <>
                <Button size="sm" onClick={() => setThirdPartyModalOpen(true)}>
                  <UploadCloud className="h-3.5 w-3.5" />
                  Import 3rd Party
                </Button>
                <Button size="sm" variant="outline" onClick={() => setThirdPartyManualOpen(true)}>
                  <PenLine className="h-3.5 w-3.5" />
                  Enter manually
                </Button>
                <div className="flex items-center gap-1.5">
                  <input
                    type="month"
                    aria-label="Vansales period month (required)"
                    title="Which calendar month does this Vansales batch cover? Required -- never inferred from the file."
                    value={vansalesPeriodMonth}
                    onChange={(e) => setVansalesPeriodMonth(e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-body-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!vansalesPeriodMonthValid}
                    title={!vansalesPeriodMonthValid ? 'Select the month this Vansales batch covers first.' : undefined}
                    onClick={() => setVansalesModalOpen(true)}
                  >
                    <UploadCloud className="h-3.5 w-3.5" />
                    Import Vansales
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!vansalesPeriodMonthValid}
                    title={!vansalesPeriodMonthValid ? 'Select the month this Vansales batch covers first.' : undefined}
                    onClick={() => setVansalesManualOpen(true)}
                  >
                    <PenLine className="h-3.5 w-3.5" />
                    Enter manually
                  </Button>
                </div>
                <Button size="sm" variant="outline" onClick={() => setSwiftModalOpen(true)}>
                  <UploadCloud className="h-3.5 w-3.5" />
                  Import Swift
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSwiftManualOpen(true)}>
                  <PenLine className="h-3.5 w-3.5" />
                  Enter manually
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDepotStoModalOpen(true)}>
                  <UploadCloud className="h-3.5 w-3.5" />
                  Import Depot STO
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDepotStoManualOpen(true)}>
                  <PenLine className="h-3.5 w-3.5" />
                  Enter manually
                </Button>
              </>
            )}
            <Link href="/transport-cost/report" className="text-body-sm text-primary hover:underline">
              View report &rarr;
            </Link>
          </div>
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
            <Button
              size="sm"
              variant={familyFilter === 'swift' ? 'default' : 'outline'}
              onClick={() => {
                setFamilyFilter('swift');
                setPage(1);
              }}
            >
              Swift
            </Button>
            <Button
              size="sm"
              variant={familyFilter === 'depot-sto' ? 'default' : 'outline'}
              onClick={() => {
                setFamilyFilter('depot-sto');
                setPage(1);
              }}
            >
              Depot STO
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
                  {/* OLIVINE LIVE OPERATING MODEL, SLICE 2 (item 6/7): the
                      "TRANSPORT OPERATIONS vs TRANSPORT LINES/LOADS"
                      distinction, at the row level -- record.lines is
                      undefined for every pre-Slice-2 historical row (an
                      operation with exactly one, unlabelled, load), so
                      that and a length-1 array both read as "1". Only a
                      genuine multi-load operation (length > 1) shows a
                      badge, keeping the ordinary single-line case visually
                      silent. */}
                  <TableHead>Loads</TableHead>
                  <TableHead>Source file</TableHead>
                  <TableHead>Imported</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      Loading&hellip;
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && (result?.data.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      No source records imported yet.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading &&
                  result?.data.map((record) => {
                    const loadCount = record.lines?.length ?? 1;
                    return (
                      <TableRow key={record._id}>
                        <TableCell>{record.sourceRowNumber}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{familyLabel(record.sheetFamily)}</Badge>
                        </TableCell>
                        <TableCell>{record.date ? new Date(record.date).toLocaleDateString() : '—'}</TableCell>
                        <TableCell>{record.registration ?? '—'}</TableCell>
                        <TableCell>{record.transporterNormalized ?? '—'}</TableCell>
                        <TableCell>{record.amount === null ? '—' : record.amount.toLocaleString()}</TableCell>
                        <TableCell>
                          {loadCount > 1 ? (
                            <Badge variant="secondary" title={`${loadCount} loads on this one transport operation -- the amount above is the whole trip's cost, not per load.`}>
                              {loadCount} loads
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">1</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate" title={record.sourceFileName}>
                          {record.sourceFileName}
                        </TableCell>
                        <TableCell>{new Date(record.importedAt).toLocaleString()}</TableCell>
                      </TableRow>
                    );
                  })}
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

      <ImportModal
        open={swiftModalOpen}
        onOpenChange={setSwiftModalOpen}
        title="Import Swift transport cost"
        description="Upload Olivine's 'Swift' sheet. Download the template below to see the expected columns. Swift rows import and preserve full provenance, but this source has no registration/transporter column -- every Swift row will consistently skip at posting time pending a vehicle identity (see SWIFT_POSTING_DECISION.md), never invented here."
        columns={SWIFT_COLUMNS}
        onImport={handleSwiftImport}
        onImportComplete={handleImportComplete}
      />

      <ImportModal
        open={depotStoModalOpen}
        onOpenChange={setDepotStoModalOpen}
        title="Import Depot STO transport cost"
        description="Upload one of Olivine's 'Depot STO' sheets (March-August). Download the template below to see the expected columns -- only DATE is required, since the real sheet's own layout drifts month to month. Posts under the stock-transfer cost category, separate from ordinary deliveries."
        columns={DEPOT_STO_COLUMNS}
        onImport={handleDepotStoImport}
        onImportComplete={handleImportComplete}
      />

      <ManualEntryModal
        open={thirdPartyManualOpen}
        onOpenChange={setThirdPartyManualOpen}
        title="Enter 3rd Party record"
        description="Type in one truck trip instead of uploading a spreadsheet -- one transport operation, which can carry more than one invoice or consignment. Saved the same way a file import is -- same validation, same duplicate check, same normalization review."
        columns={THIRD_PARTY_PARENT_COLUMNS}
        lineColumns={THIRD_PARTY_LINE_COLUMNS}
        onImport={handleThirdPartyImport}
        onImportComplete={handleImportComplete}
        sourceLabel="Manual entry (3rd Party)"
      />

      <ManualEntryModal
        open={vansalesManualOpen}
        onOpenChange={setVansalesManualOpen}
        title="Enter Vansales record"
        description={`Type in a single Vansales row for ${vansalesPeriodMonth || 'the selected month'}. Saved the same way a file import is.`}
        columns={VANSALES_COLUMNS}
        onImport={handleVansalesImport}
        onImportComplete={handleImportComplete}
        sourceLabel="Manual entry (Vansales)"
      />

      <ManualEntryModal
        open={swiftManualOpen}
        onOpenChange={setSwiftManualOpen}
        title="Enter Swift record"
        description="Type in a single Swift consignment instead of uploading a spreadsheet. Saved the same way a file import is."
        columns={SWIFT_COLUMNS}
        onImport={handleSwiftImport}
        onImportComplete={handleImportComplete}
        sourceLabel="Manual entry (Swift)"
      />

      <ManualEntryModal
        open={depotStoManualOpen}
        onOpenChange={setDepotStoManualOpen}
        title="Enter Depot STO record"
        description="Type in a single Depot STO movement instead of uploading a spreadsheet. Saved the same way a file import is."
        columns={DEPOT_STO_COLUMNS}
        onImport={handleDepotStoImport}
        onImportComplete={handleImportComplete}
        sourceLabel="Manual entry (Depot STO)"
      />
    </div>
  );
}
