// frontend/modules/transport-cost/components/EditRecordDialog.tsx
//
// OLIVINE LIVE OPERATING MODEL, SLICE 5. One dialog, two modes --
// mirroring the backend's own Edit/Correct split (see
// TransportCostRecordCommandService.editSourceRecord/
// correctPostedSourceRecord's headers).
//
// GAP-CLOSURE PASS, Objective 2 -- field coverage expanded beyond the
// original Slice 5 pass's documented gap. The financial-field section
// (amount/date/cost-facing company/transporter/vehicle) now renders
// whenever those fields are actually EDITABLE, not just in 'correct'
// mode: `showFinancialFields = mode === 'correct' || (mode === 'edit' &&
// !isPosted)`, mirroring the backend's own rule exactly (editSourceRecord
// refuses a financial-field patch ONLY when the record is already
// posted -- see that method's own header). `isPosted` is a new required
// prop the caller must supply (both TransportCostImportPage and
// TransportOperationDetailPage already know the record's derived
// status from their own existing queries, so this costs no new fetch).
//
// GAP-CLOSURE PASS, Objective 2 (multi-line editing). `lines` is now
// editable here as its own table (add/remove/reorder rows), gated on
// whether the record actually HAS a `lines` array at all --
// TransportCostSourceRecord.lines's own doc comment, invariant #1: an
// undefined `lines` means "imported before this field existed" and must
// never be fabricated retroactively, so a legacy pre-Slice-2 record
// keeps the plain single-row scalar inputs below exactly as before
// (`hasLines = Array.isArray(record.lines)`).
//
// INVARIANT THIS UI MUST PRESERVE (same doc comment, invariant #3):
// `lines[0]` is the SAME data as this record's own flat customerName/
// destinationTown/salesInvoiceNo/tonnageRaw fields, not an independent
// copy that could drift. The repository's conditionalUpdate() applies
// whatever the patch says verbatim -- it does not derive the flat
// fields from `lines` or vice versa (confirmed by reading
// TransportCostRecordCommandService.editSourceRecord and
// TransportCostSourceRecordRepository.conditionalUpdate: both just
// `$set` exactly the patch keys given, no cross-field derivation). So
// when `lines` exists, this dialog stops rendering the flat
// customerName/destinationTown/salesInvoiceNo/tonnageRaw inputs as a
// SEPARATE editable copy -- having two editable representations of the
// same underlying data is exactly how they'd drift -- and instead
// derives those four flat fields from `lines[0]` itself at submit time
// (see handleSubmit). `lines` never carries a cost/amount field,
// matching TransportCostLine's own doc comment -- this table has no
// amount column and cannot be made to have one through this UI.
// `lines.length` is never allowed to drop to zero here (row remove is a
// no-op on the last remaining row), matching invariant #2's "always at
// least one element" for every record that has `lines` at all.
//
// customerName/destinationTown now use SearchCreateSelect (Customer/
// Destination master data, Slice 3) instead of a plain text Input --
// closes the "do not turn controlled master data back into uncontrolled
// free text" gap the original Slice 5 pass left open. transporterPartnerId/
// contractedVehicleId use IdentityPicker (see that component's own header
// for why it's a separate, id-committing component rather than reusing
// SearchCreateSelect directly) with an inline "Request new" action --
// see request-new-transporter.command.ts for the full decision record on
// why that is safe now.
//
// DECISION: confirmation uses window.confirm(), not a new dialog
// primitive -- see this file's git history / the gap-analysis doc for
// the original reasoning (unchanged by this pass).

'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/frontend/shared/ui/feedback/dialog';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { SearchCreateSelect } from '@/frontend/shared/ui/forms/SearchCreateSelect';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { IdentityPicker, type IdentityPickerResult } from './IdentityPicker';
import { transportCostApi } from '../services/transport-cost.api';
import { useRequestNewTransporter, useRequestNewVehicle } from '../hooks/useTransportCostMutations';
import type { TransportCostSourceRecord, TransportCostLine } from '@/shared/types/transport-cost.types';
import type { SourceRecordPatch } from '../types';
import { COST_FACING_COMPANIES } from '../types';

/** A `lines[]` row is only ever edited as a whole record -- see this
 *  file's header on why `undefined` fields there are never split back
 *  into a partial patch of their own. Blank text cells commit as
 *  `undefined` (matching TransportCostLine's own optional string
 *  fields); a blank tonnage cell commits as `null`, matching
 *  TransportCostLine.tonnageRaw's own `number | null` (never optional)
 *  type -- the same "raw storage, never coerced to 0" discipline its
 *  doc comment describes. */
function blankLine(lineNumber: number): TransportCostLine {
  return {
    lineNumber,
    salesInvoiceNo: '',
    customerName: '',
    consignmentNumber: '',
    destinationTown: '',
    tonnageRaw: null,
  };
}

export type EditRecordDialogMode = 'edit' | 'correct';

interface EditRecordDialogProps {
  open: boolean;
  mode: EditRecordDialogMode;
  record: TransportCostSourceRecord | null;
  /** Whether `record` is currently posted -- decides whether the financial-field section is editable in 'edit' mode (see this file's header). Ignored in 'correct' mode, which is only ever opened for a posted record. */
  isPosted: boolean;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (patch: SourceRecordPatch) => Promise<void>;
}

function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function EditRecordDialog({ open, mode, record, isPosted, isSubmitting, onOpenChange, onSubmit }: EditRecordDialogProps) {
  const [customerName, setCustomerName] = useState('');
  const [destinationTown, setDestinationTown] = useState('');
  const [salesInvoiceNo, setSalesInvoiceNo] = useState('');
  const [tonnageRaw, setTonnageRaw] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [costFacingCompany, setCostFacingCompany] = useState<string>('');
  const [transporterPartnerId, setTransporterPartnerId] = useState('');
  const [transporterLabel, setTransporterLabel] = useState('');
  const [transporterPending, setTransporterPending] = useState(false);
  const [contractedVehicleId, setContractedVehicleId] = useState('');
  const [vehicleLabel, setVehicleLabel] = useState('');
  const [vehiclePending, setVehiclePending] = useState(false);
  // GAP-CLOSURE PASS, Objective 2. Local editable copy of `record.lines`
  // -- see this file's header for the sync-with-flat-fields invariant
  // this state must uphold at submit time. `[]` (never populated) is
  // the "legacy record, no lines array" state; the dialog renders the
  // plain scalar inputs instead of this table whenever it's empty.
  const [lines, setLines] = useState<TransportCostLine[]>([]);

  const requestNewTransporter = useRequestNewTransporter();
  const requestNewVehicle = useRequestNewVehicle();

  // Re-seed the form from `record` every time the dialog opens for a
  // (possibly different) record -- the same "reset on open" intent as
  // ExpenseModal's remount-key technique, done here with an effect since
  // this dialog has no child form component of its own to remount.
  useEffect(() => {
    if (!open || !record) return;
    setCustomerName(record.customerName ?? '');
    setDestinationTown(record.destinationTown ?? '');
    setSalesInvoiceNo(record.salesInvoiceNo ?? '');
    setTonnageRaw(record.tonnageRaw !== null && record.tonnageRaw !== undefined ? String(record.tonnageRaw) : '');
    setAmount(record.amount !== null && record.amount !== undefined ? String(record.amount) : '');
    setDate(toDateInputValue(record.date));
    setCostFacingCompany(record.costFacingCompany ?? '');
    setTransporterPartnerId(record.transporterPartnerId ?? '');
    // Best-effort display label: the confirmed canonical name isn't on
    // the source record itself (only the id is), so this falls back to
    // the raw imported value -- close enough for display, never sent
    // back to the server (only transporterPartnerId is submitted).
    setTransporterLabel(record.transporterNormalized ?? '');
    setTransporterPending(false);
    setContractedVehicleId(record.contractedVehicleId ?? '');
    setVehicleLabel(record.registration ?? '');
    setVehiclePending(false);
    // Deep-copy each line (not just the array) -- row edits below mutate
    // via setLines(prev => ...map...), and reusing the record's own
    // nested objects would let an in-progress, unsaved edit alias (and
    // therefore silently mutate) the query cache's copy of `record`.
    setLines(record.lines ? record.lines.map((l) => ({ ...l })) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record?._id]);

  if (!record) return null;

  const showFinancialFields = mode === 'correct' || (mode === 'edit' && !isPosted);
  // See this file's header, invariant #1: undefined `record.lines` (a
  // legacy pre-Slice-2 row) never gets a `lines` array fabricated for
  // it here -- the plain scalar inputs below are its only edit surface.
  const hasLines = Array.isArray(record.lines);

  function updateLine(index: number, patch: Partial<TransportCostLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, blankLine(prev.length + 1)]);
  }

  function removeLine(index: number) {
    setLines((prev) => {
      // Never drop below one line -- invariant #2 on
      // TransportCostSourceRecord.lines guarantees every record that
      // has `lines` at all has at least one element; a record reduced
      // to zero lines here would submit a patch this dialog itself
      // could never re-open correctly (hasLines would then read
      // "populated" for an empty array, not "legacy/no lines").
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index).map((l, i) => ({ ...l, lineNumber: i + 1 }));
    });
  }

  function moveLine(index: number, direction: -1 | 1) {
    setLines((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      // `lineNumber` is display-order only, not a database key (see
      // TransportCostLine's own doc comment) -- renumbering here keeps
      // it always equal to the row's actual position.
      return next.map((l, i) => ({ ...l, lineNumber: i + 1 }));
    });
  }

  async function handleSubmit() {
    if (!record) return;
    const patch: SourceRecordPatch = {};
    if (mode === 'edit') {
      if (hasLines) {
        // Normalize before diffing: trim/blank-to-undefined for the
        // text cells, blank-to-null for tonnage (never undefined --
        // TransportCostLine.tonnageRaw is `number | null`, not
        // optional), lineNumber forced to the row's actual position.
        const normalizedLines: TransportCostLine[] = lines.map((l, i) => ({
          lineNumber: i + 1,
          salesInvoiceNo: l.salesInvoiceNo?.trim() || undefined,
          customerName: l.customerName?.trim() || undefined,
          consignmentNumber: l.consignmentNumber?.trim() || undefined,
          destinationTown: l.destinationTown?.trim() || undefined,
          tonnageRaw:
            l.tonnageRaw === null || l.tonnageRaw === undefined || Number.isNaN(l.tonnageRaw)
              ? null
              : l.tonnageRaw,
        }));
        const originalNormalized: TransportCostLine[] = (record.lines ?? []).map((l, i) => ({
          lineNumber: i + 1,
          salesInvoiceNo: l.salesInvoiceNo ?? undefined,
          customerName: l.customerName ?? undefined,
          consignmentNumber: l.consignmentNumber ?? undefined,
          destinationTown: l.destinationTown ?? undefined,
          tonnageRaw: l.tonnageRaw ?? null,
        }));
        if (JSON.stringify(normalizedLines) !== JSON.stringify(originalNormalized)) {
          patch.lines = normalizedLines;
          // MANDATORY sync, not optional -- see this file's header,
          // invariant #3. `lines[0]` and these four flat fields are the
          // SAME data; nothing downstream derives one from the other,
          // so a `lines` patch without this would silently let the
          // flat fields drift from what the loads table (and every
          // consumer that only reads the flat fields) now shows.
          const first = normalizedLines[0];
          patch.customerName = first.customerName;
          patch.destinationTown = first.destinationTown;
          patch.salesInvoiceNo = first.salesInvoiceNo;
          patch.tonnageRaw = first.tonnageRaw;
        }
      } else {
        if (customerName !== (record.customerName ?? '')) patch.customerName = customerName || undefined;
        if (destinationTown !== (record.destinationTown ?? '')) patch.destinationTown = destinationTown || undefined;
        if (salesInvoiceNo !== (record.salesInvoiceNo ?? '')) patch.salesInvoiceNo = salesInvoiceNo || undefined;
        const tonnageValue = tonnageRaw.trim() === '' ? undefined : Number(tonnageRaw);
        if (tonnageValue !== record.tonnageRaw) patch.tonnageRaw = tonnageValue;
      }
    }
    if (showFinancialFields) {
      if (mode === 'correct') {
        const amountValue = amount.trim() === '' ? null : Number(amount);
        if (amountValue !== record.amount) patch.amount = amountValue as never;
        const dateValue = date ? new Date(`${date}T00:00:00.000Z`) : undefined;
        if (dateValue && toDateInputValue(dateValue) !== toDateInputValue(record.date)) {
          patch.date = dateValue;
        }
      } else {
        // 'edit' mode on a never-posted record: the same fields are
        // still editable (see this file's header), submitted through
        // patch, never through the reverse+repost Correct pathway.
        const amountValue = amount.trim() === '' ? null : Number(amount);
        if (amountValue !== record.amount) patch.amount = amountValue as never;
        const dateValue = date ? new Date(`${date}T00:00:00.000Z`) : undefined;
        if (dateValue && toDateInputValue(dateValue) !== toDateInputValue(record.date)) {
          patch.date = dateValue;
        }
      }
      if (costFacingCompany !== (record.costFacingCompany ?? '')) {
        patch.costFacingCompany = (costFacingCompany || null) as never;
      }
      if (transporterPartnerId !== (record.transporterPartnerId ?? '')) {
        patch.transporterPartnerId = transporterPartnerId || undefined;
      }
      if (contractedVehicleId !== (record.contractedVehicleId ?? '')) {
        patch.contractedVehicleId = contractedVehicleId || undefined;
      }
    }
    if (Object.keys(patch).length === 0) {
      onOpenChange(false);
      return;
    }
    await onSubmit(patch);
  }

  async function handleTransporterSearch(query: string): Promise<IdentityPickerResult[]> {
    const rows = await transportCostApi.searchTransporters(query);
    return rows.map((r) => ({ id: r.id, label: r.label }));
  }

  async function handleTransporterRequestNew(rawName: string): Promise<IdentityPickerResult> {
    const result = await requestNewTransporter.mutateAsync(rawName);
    return { id: result.id, label: result.label, reviewStatus: result.reviewStatus };
  }

  function handleTransporterChange(result: IdentityPickerResult | null) {
    setTransporterPartnerId(result?.id ?? '');
    setTransporterLabel(result?.label ?? '');
    setTransporterPending(result?.reviewStatus === 'needs-review');
    // Changing the transporter invalidates any already-selected vehicle
    // -- a vehicle always belongs to exactly one transporter (see
    // ContractedVehicle.transporterPartnerId's own doc comment).
    setContractedVehicleId('');
    setVehicleLabel('');
    setVehiclePending(false);
  }

  async function handleVehicleSearch(query: string): Promise<IdentityPickerResult[]> {
    if (!transporterPartnerId) return [];
    const rows = await transportCostApi.searchVehicles(query, transporterPartnerId);
    return rows.map((r) => ({ id: r.id, label: r.label }));
  }

  async function handleVehicleRequestNew(rawRegistration: string): Promise<IdentityPickerResult> {
    const result = await requestNewVehicle.mutateAsync({
      registration: rawRegistration,
      transporterPartnerId,
      sourceRecordId: record?._id,
    });
    return { id: result.id, label: result.label, reviewStatus: result.reviewStatus };
  }

  function handleVehicleChange(result: IdentityPickerResult | null) {
    setContractedVehicleId(result?.id ?? '');
    setVehicleLabel(result?.label ?? '');
    setVehiclePending(result?.reviewStatus === 'needs-review');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-form-wide">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit record' : 'Correct posted record'}</DialogTitle>
          <DialogDescription>
            {mode === 'edit' ? (
              isPosted ? (
                <>Row {record.sourceRowNumber} &middot; {record.sourceFileName}. Non-financial fields only -- this record is already posted, so financial fields (amount, date, company, transporter, vehicle) require Correct instead.</>
              ) : (
                <>Row {record.sourceRowNumber} &middot; {record.sourceFileName}. Not yet posted -- every field below can be changed freely; nothing here touches the finance ledger until this record is posted.</>
              )
            ) : (
              <>
                Row {record.sourceRowNumber} &middot; {record.sourceFileName}. This record is already posted to the
                finance ledger. Saving here will reverse the existing posting and create a new one for the corrected
                values -- the original posting is never edited in place, and the net ledger effect is the corrected
                total, not the sum of both. This cannot be undone by closing this dialog once submitted.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {mode === 'edit' && !hasLines && (
            <>
              <SearchCreateSelect
                id="edit-customer-name"
                label="Customer name"
                value={customerName}
                onChange={setCustomerName}
                search={(q) => transportCostApi.searchCustomers(q)}
                onCreateNew={async (name) => {
                  const r = await transportCostApi.createCustomer(name);
                  return { id: r.id, label: r.name };
                }}
                createLabel="customer"
              />
              <SearchCreateSelect
                id="edit-destination-town"
                label="Destination town"
                value={destinationTown}
                onChange={setDestinationTown}
                search={(q) => transportCostApi.searchDestinations(q)}
                onCreateNew={async (name) => {
                  const r = await transportCostApi.createDestination(name);
                  return { id: r.id, label: r.name };
                }}
                createLabel="destination"
              />
              <div className="space-y-1">
                <Label htmlFor="edit-sales-invoice-no">Sales invoice no</Label>
                <Input id="edit-sales-invoice-no" value={salesInvoiceNo} onChange={(e) => setSalesInvoiceNo(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-tonnage">Tonnage</Label>
                <Input id="edit-tonnage" type="number" value={tonnageRaw} onChange={(e) => setTonnageRaw(e.target.value)} />
              </div>
            </>
          )}

          {mode === 'edit' && hasLines && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Loads on this operation ({lines.length})</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Add line
                </Button>
              </div>
              <p className="text-caption text-muted-foreground">
                Line 1 is also this record&rsquo;s own customer/destination/invoice/tonnage summary -- editing it here
                updates both. No line carries its own cost; the operation&rsquo;s total amount above is unaffected by
                how many lines it has.
              </p>
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Consignment</TableHead>
                      <TableHead className="text-right">Tonnage</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, index) => (
                      <TableRow key={index}>
                        <TableCell className="align-top pt-2.5">{index + 1}</TableCell>
                        <TableCell className="min-w-40">
                          <SearchCreateSelect
                            id={`edit-line-${index}-customer`}
                            value={line.customerName ?? ''}
                            onChange={(v) => updateLine(index, { customerName: v })}
                            search={(q) => transportCostApi.searchCustomers(q)}
                            onCreateNew={async (name) => {
                              const r = await transportCostApi.createCustomer(name);
                              return { id: r.id, label: r.name };
                            }}
                            createLabel="customer"
                            placeholder="Customer…"
                          />
                        </TableCell>
                        <TableCell className="min-w-40">
                          <SearchCreateSelect
                            id={`edit-line-${index}-destination`}
                            value={line.destinationTown ?? ''}
                            onChange={(v) => updateLine(index, { destinationTown: v })}
                            search={(q) => transportCostApi.searchDestinations(q)}
                            onCreateNew={async (name) => {
                              const r = await transportCostApi.createDestination(name);
                              return { id: r.id, label: r.name };
                            }}
                            createLabel="destination"
                            placeholder="Destination…"
                          />
                        </TableCell>
                        <TableCell className="min-w-28">
                          <Input
                            aria-label={`Line ${index + 1} sales invoice no`}
                            value={line.salesInvoiceNo ?? ''}
                            onChange={(e) => updateLine(index, { salesInvoiceNo: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="min-w-28">
                          <Input
                            aria-label={`Line ${index + 1} consignment number`}
                            value={line.consignmentNumber ?? ''}
                            onChange={(e) => updateLine(index, { consignmentNumber: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="min-w-24">
                          <Input
                            aria-label={`Line ${index + 1} tonnage`}
                            type="number"
                            className="text-right"
                            value={line.tonnageRaw === null || line.tonnageRaw === undefined ? '' : String(line.tonnageRaw)}
                            onChange={(e) =>
                              updateLine(index, {
                                tonnageRaw: e.target.value.trim() === '' ? null : Number(e.target.value),
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="align-top pt-1.5">
                          <div className="flex items-center gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Move line ${index + 1} up`}
                              disabled={index === 0}
                              onClick={() => moveLine(index, -1)}
                            >
                              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Move line ${index + 1} down`}
                              disabled={index === lines.length - 1}
                              onClick={() => moveLine(index, 1)}
                            >
                              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove line ${index + 1}`}
                              disabled={lines.length <= 1}
                              onClick={() => removeLine(index)}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {showFinancialFields && (
            <>
              {mode === 'correct' && (
                <div className="space-y-1">
                  <Label htmlFor="correct-amount">Amount (corrected)</Label>
                  <Input id="correct-amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <p className="text-caption text-muted-foreground">
                    Currently posted at {record.amount === null ? '—' : record.amount.toLocaleString()} {record.currency ?? ''}.
                  </p>
                </div>
              )}
              {mode === 'edit' && (
                <div className="space-y-1">
                  <Label htmlFor="edit-amount">Amount</Label>
                  <Input id="edit-amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="record-date">Date</Label>
                <Input id="record-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="record-cost-facing-company">Cost-facing company</Label>
                <select
                  id="record-cost-facing-company"
                  className="form-select w-full"
                  value={costFacingCompany}
                  onChange={(e) => setCostFacingCompany(e.target.value)}
                >
                  <option value="">Unattributed</option>
                  {COST_FACING_COMPANIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <IdentityPicker
                id="record-transporter"
                label="Transporter"
                placeholder="Search transporter…"
                value={transporterPartnerId}
                valueLabel={transporterLabel}
                valuePending={transporterPending}
                onChange={handleTransporterChange}
                search={handleTransporterSearch}
                onRequestNew={handleTransporterRequestNew}
                requestNewLabel="transporter"
              />
              <IdentityPicker
                id="record-vehicle"
                label="Vehicle / registration"
                placeholder={transporterPartnerId ? 'Search vehicle…' : 'Pick a transporter first'}
                value={contractedVehicleId}
                valueLabel={vehicleLabel}
                valuePending={vehiclePending}
                onChange={handleVehicleChange}
                search={handleVehicleSearch}
                onRequestNew={transporterPartnerId ? handleVehicleRequestNew : undefined}
                requestNewLabel="vehicle"
                disabled={!transporterPartnerId}
                emptyHint={transporterPartnerId ? 'No matches.' : 'Pick a transporter first.'}
              />
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} variant={mode === 'correct' ? 'destructive' : 'default'}>
            {isSubmitting ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Reverse & repost corrected values'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
