// frontend/modules/transport-cost/pages/TransportCostImportPage.tsx
//
// Phase O1's UI surface: import Olivine's four sheet families (3rd
// Party, Vansales, Swift, Depot STO) and verify the rows landed --
// nothing here computes a cost, a total, or a per-tonne figure. See the
// backend module's header comments for why that line is not crossed.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { useTransportCostSourceRecords, useTransportCostSourceRecordStatuses } from '../hooks/useTransportCost';
import {
  useEditSourceRecord,
  useCorrectPostedSourceRecord,
  useCancelSourceRecord,
  useDuplicateSourceRecord,
} from '../hooks/useTransportCostMutations';
import { StatusBadge } from '../components/StatusBadge';
import { RecordActionsMenu } from '../components/RecordActionsMenu';
import { EditRecordDialog, type EditRecordDialogMode } from '../components/EditRecordDialog';
import type { TransportCostSourceRecord, TransportCostSheetFamily } from '@/shared/types/transport-cost.types';
import type { SourceRecordPatch } from '../types';
import { COST_FACING_COMPANIES } from '@/shared/types/cost-facing-company.types';
import { COST_CATEGORY_LABEL_BY_FAMILY } from '../types';

// PRODUCTION FIX (Slice 1-5 verification pass): the operational records
// table below was missing Company/Category/Customer/Destination columns
// even though the data is already present on every fetched record (see
// shared/types/transport-cost.types.ts's costFacingCompany/customerName/
// destinationTown fields) -- the client's own spec requires them ("date/
// company/category/transporter/vehicle/customer/destination/cost/
// loads/status/available actions"). This lookup renders the company's
// display label from its stored value; a value with no match (should
// never happen given the closed enum, but fails safe) falls back to the
// raw stored value rather than hiding it.
const COST_FACING_COMPANY_LABEL_BY_VALUE = new Map(COST_FACING_COMPANIES.map((c) => [c.value, c.label]));

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

// ── Slice 3: manual-entry-ONLY master-data search/+Add New wiring. ────
// Clones of the column sets above with just the customer/destination/
// transporter/registration fields swapped to `type: 'search-select'`.
// Deliberately built as a DERIVED copy (withSearchSelect), never a
// mutation of THIRD_PARTY_PARENT_COLUMNS/THIRD_PARTY_LINE_COLUMNS/
// VANSALES_COLUMNS/SWIFT_COLUMNS/DEPOT_STO_COLUMNS themselves: every
// ImportModal instance below keeps using those original arrays,
// unchanged, so bulk file upload's columns, downloadable template, and
// coerceValue path stay byte-for-byte what they were before this slice
// -- exactly the client's own "Do NOT break bulk import... Master-data
// selection is primarily a manual-entry UX capability" instruction.
// Only the five ManualEntryModal instances further down this file are
// given the *_MANUAL_COLUMNS variants.
//
// Field mapping, decided by reading each sheet family's own validated
// schema (validateAndBuildThirdParty/Vansales/Swift/DepotSto) rather
// than assumed -- see OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md
// Section 6 for the full record:
//   3rd Party parent: transporter, registration (Transporter/Vehicle).
//   3rd Party lines:  customerName, destinationTown (Customer/Destination).
//   Vansales:         truck, registration (Transporter/Vehicle) ONLY --
//                      payerName is not customerName, and Vansales has
//                      no destination field at all.
//   Swift:             receiversName -> Customer, destinationLocation ->
//                      Destination. No registration/transporter column
//                      exists on this sheet family (see SWIFT_COLUMNS'
//                      own comment).
//   Depot STO:         customerName, destinationTown, transporter,
//                      registration -- all four apply.
function withSearchSelect(
  columns: ImportColumnDef[],
  overrides: Record<string, NonNullable<ImportColumnDef['searchSelect']>>
): ImportColumnDef[] {
  return columns.map((col) =>
    overrides[col.key] ? { ...col, type: 'search-select', searchSelect: overrides[col.key] } : col
  );
}

const CUSTOMER_SEARCH_SELECT: NonNullable<ImportColumnDef['searchSelect']> = {
  search: (q: string) => transportCostApi.searchCustomers(q),
  onCreateNew: async (name: string) => {
    const result = await transportCostApi.createCustomer(name);
    return { id: result.id, label: result.name };
  },
  createLabel: 'Customer',
};

const DESTINATION_SEARCH_SELECT: NonNullable<ImportColumnDef['searchSelect']> = {
  search: (q: string) => transportCostApi.searchDestinations(q),
  onCreateNew: async (name: string) => {
    const result = await transportCostApi.createDestination(name);
    return { id: result.id, label: result.name };
  },
  createLabel: 'Destination',
};

// Search only -- no `onCreateNew`. See master-data.service.ts's header
// for why manual entry never silently creates a confirmed Transporter/
// Vehicle identity: a genuinely new one still goes through the existing
// O1/O2 normalization-review queue exactly as it did before this slice.
const TRANSPORTER_SEARCH_SELECT: NonNullable<ImportColumnDef['searchSelect']> = {
  search: (q: string) => transportCostApi.searchTransporters(q),
};

const VEHICLE_SEARCH_SELECT: NonNullable<ImportColumnDef['searchSelect']> = {
  search: (q: string) => transportCostApi.searchVehicles(q),
};

const THIRD_PARTY_PARENT_MANUAL_COLUMNS = withSearchSelect(THIRD_PARTY_PARENT_COLUMNS, {
  transporter: TRANSPORTER_SEARCH_SELECT,
  registration: VEHICLE_SEARCH_SELECT,
});

const THIRD_PARTY_LINE_MANUAL_COLUMNS = withSearchSelect(THIRD_PARTY_LINE_COLUMNS, {
  customerName: CUSTOMER_SEARCH_SELECT,
  destinationTown: DESTINATION_SEARCH_SELECT,
});

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

// Slice 3 manual-only variants -- see withSearchSelect's own header
// comment above THIRD_PARTY_PARENT_MANUAL_COLUMNS for the full
// reasoning and the field-mapping decision record.
const VANSALES_MANUAL_COLUMNS = withSearchSelect(VANSALES_COLUMNS, {
  truck: TRANSPORTER_SEARCH_SELECT,
  registration: VEHICLE_SEARCH_SELECT,
});

const SWIFT_MANUAL_COLUMNS = withSearchSelect(SWIFT_COLUMNS, {
  receiversName: CUSTOMER_SEARCH_SELECT,
  destinationLocation: DESTINATION_SEARCH_SELECT,
});

const DEPOT_STO_MANUAL_COLUMNS = withSearchSelect(DEPOT_STO_COLUMNS, {
  customerName: CUSTOMER_SEARCH_SELECT,
  transporter: TRANSPORTER_SEARCH_SELECT,
  registration: VEHICLE_SEARCH_SELECT,
  destinationTown: DESTINATION_SEARCH_SELECT,
});

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
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canImport = permissionService.hasPermission(roles, Permission.TRANSPORT_COST_IMPORT);
  // OLIVINE LIVE OPERATING MODEL, SLICE 5.
  const canNormalize = permissionService.hasPermission(roles, Permission.TRANSPORT_COST_NORMALIZE);
  const canManageFinance = permissionService.hasPermission(roles, Permission.FINANCE_MANAGE);

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

  // OLIVINE LIVE OPERATING MODEL, SLICE 5. Bulk status for exactly this
  // page's rows -- ONE request per page, never one per row (see
  // useTransportCostSourceRecordStatuses's own header).
  const pageRecordIds = (result?.data ?? []).map((r) => r._id).filter((id): id is string => Boolean(id));
  const { data: statuses } = useTransportCostSourceRecordStatuses(pageRecordIds);

  const editMutation = useEditSourceRecord();
  const correctMutation = useCorrectPostedSourceRecord();
  const cancelMutation = useCancelSourceRecord();
  const duplicateMutation = useDuplicateSourceRecord();

  const [editTarget, setEditTarget] = useState<TransportCostSourceRecord | null>(null);
  const [editDialogMode, setEditDialogMode] = useState<EditRecordDialogMode>('edit');

  async function handleEditSubmit(patch: SourceRecordPatch) {
    if (!editTarget?._id) return;
    if (editDialogMode === 'edit') {
      await editMutation.mutateAsync({ sourceRecordId: editTarget._id, patch });
    } else {
      await correctMutation.mutateAsync({ sourceRecordId: editTarget._id, patch });
    }
    setEditTarget(null);
  }

  async function handleCancelRecord(record: TransportCostSourceRecord) {
    if (!record._id) return;
    const status = statuses?.[record._id];
    const consequence =
      status === 'posted'
        ? 'This record is already posted -- cancelling it will reverse its ledger entry. This cannot be undone.'
        : 'This record has not been posted yet -- cancelling it just marks it as not-to-be-posted.';
    const reason = window.prompt(`${consequence}\n\nEnter a reason to cancel row ${record.sourceRowNumber}:`);
    if (reason === null) return;
    if (!reason.trim()) {
      window.alert('A reason is required to cancel a record.');
      return;
    }
    await cancelMutation.mutateAsync({ sourceRecordId: record._id, reason: reason.trim() });
  }

  async function handleDuplicateRecord(record: TransportCostSourceRecord) {
    if (!record._id) return;
    const duplicate = await duplicateMutation.mutateAsync(record._id);
    if (duplicate._id) router.push(`/transport-cost/operations/${duplicate._id}`);
  }

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
                  {/* PRODUCTION FIX (Slice 1-5 verification pass): Category is a
                      DIFFERENT dimension from the Family badge above -- Family is
                      the raw sheetFamily (third-party/vansales/swift/depot-sto);
                      Category is the cost category that dimension actually posts
                      as (e.g. both third-party and swift post as "Third-party
                      transport"). See COST_CATEGORY_LABEL_BY_FAMILY's doc comment. */}
                  <TableHead>Category</TableHead>
                  <TableHead>Date</TableHead>
                  {/* PRODUCTION FIX: cost-facing company was entered on every one of
                      these records (Slice 1's required selector) but was never
                      shown as its own column here -- do not confuse this with
                      Transporter/Customer below, see cost-facing-company.types.ts. */}
                  <TableHead>Company</TableHead>
                  <TableHead>Registration</TableHead>
                  <TableHead>Transporter</TableHead>
                  {/* PRODUCTION FIX: Customer/Destination are per-line fields for a
                      multi-load operation (Slice 2) -- this column shows line 1's
                      value (the operation's own summary field), consistent with
                      how EditRecordDialog treats line 1 as the operation's summary. */}
                  <TableHead>Customer</TableHead>
                  <TableHead>Destination</TableHead>
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
                  {/* OLIVINE LIVE OPERATING MODEL, SLICE 5. */}
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={15} className="py-8 text-center text-muted-foreground">
                      Loading&hellip;
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && (result?.data.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={15} className="py-8 text-center text-muted-foreground">
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
                        <TableCell>
                          <span className="text-muted-foreground">{COST_CATEGORY_LABEL_BY_FAMILY[record.sheetFamily]?.label ?? '—'}</span>
                        </TableCell>
                        <TableCell>{record.date ? new Date(record.date).toLocaleDateString() : '—'}</TableCell>
                        <TableCell>
                          {record.costFacingCompany ? (
                            COST_FACING_COMPANY_LABEL_BY_VALUE.get(record.costFacingCompany) ?? record.costFacingCompany
                          ) : (
                            <span className="text-muted-foreground" title="No cost-facing company was captured for this record.">Unattributed</span>
                          )}
                        </TableCell>
                        <TableCell>{record.registration ?? '—'}</TableCell>
                        <TableCell>{record.transporterNormalized ?? '—'}</TableCell>
                        <TableCell>{record.customerName ?? '—'}</TableCell>
                        <TableCell>{record.destinationTown ?? '—'}</TableCell>
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
                        <TableCell>
                          {record._id && statuses?.[record._id] ? (
                            <StatusBadge status={statuses[record._id]} />
                          ) : (
                            <span className="text-muted-foreground">&hellip;</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <RecordActionsMenu
                            status={record._id ? statuses?.[record._id] : undefined}
                            permissions={{ canNormalize, canManageFinance }}
                            onView={() => record._id && router.push(`/transport-cost/operations/${record._id}`)}
                            onEdit={() => {
                              setEditTarget(record);
                              setEditDialogMode('edit');
                            }}
                            onCorrect={() => {
                              setEditTarget(record);
                              setEditDialogMode('correct');
                            }}
                            onCancel={() => handleCancelRecord(record)}
                            onDuplicate={() => handleDuplicateRecord(record)}
                          />
                        </TableCell>
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
        columns={THIRD_PARTY_PARENT_MANUAL_COLUMNS}
        lineColumns={THIRD_PARTY_LINE_MANUAL_COLUMNS}
        onImport={handleThirdPartyImport}
        onImportComplete={handleImportComplete}
        sourceLabel="Manual entry (3rd Party)"
      />

      <ManualEntryModal
        open={vansalesManualOpen}
        onOpenChange={setVansalesManualOpen}
        title="Enter Vansales record"
        description={`Type in a single Vansales row for ${vansalesPeriodMonth || 'the selected month'}. Saved the same way a file import is.`}
        columns={VANSALES_MANUAL_COLUMNS}
        onImport={handleVansalesImport}
        onImportComplete={handleImportComplete}
        sourceLabel="Manual entry (Vansales)"
      />

      <ManualEntryModal
        open={swiftManualOpen}
        onOpenChange={setSwiftManualOpen}
        title="Enter Swift record"
        description="Type in a single Swift consignment instead of uploading a spreadsheet. Saved the same way a file import is."
        columns={SWIFT_MANUAL_COLUMNS}
        onImport={handleSwiftImport}
        onImportComplete={handleImportComplete}
        sourceLabel="Manual entry (Swift)"
      />

      <ManualEntryModal
        open={depotStoManualOpen}
        onOpenChange={setDepotStoManualOpen}
        title="Enter Depot STO record"
        description="Type in a single Depot STO movement instead of uploading a spreadsheet. Saved the same way a file import is."
        columns={DEPOT_STO_MANUAL_COLUMNS}
        onImport={handleDepotStoImport}
        onImportComplete={handleImportComplete}
        sourceLabel="Manual entry (Depot STO)"
      />

      {/* OLIVINE LIVE OPERATING MODEL, SLICE 5. */}
      <EditRecordDialog
        open={editTarget !== null}
        mode={editDialogMode}
        record={editTarget}
        isPosted={editTarget?._id ? statuses?.[editTarget._id] === 'posted' : false}
        isSubmitting={editMutation.isPending || correctMutation.isPending}
        onOpenChange={(open) => !open && setEditTarget(null)}
        onSubmit={handleEditSubmit}
      />
    </div>
  );
}
