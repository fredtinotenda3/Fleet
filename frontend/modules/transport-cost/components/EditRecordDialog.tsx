// frontend/modules/transport-cost/components/EditRecordDialog.tsx
//
// OLIVINE LIVE OPERATING MODEL, SLICE 5. One dialog, two modes --
// mirroring the backend's own Edit/Correct split (see
// TransportCostRecordCommandService.editSourceRecord/
// correctPostedSourceRecord's headers): 'edit' offers a scoped subset of
// NON_FINANCIAL_EDITABLE_FIELDS, 'correct' offers a scoped subset of
// FINANCIAL_SOURCE_RECORD_FIELDS. The two field lists themselves are
// restated here, not imported, for the same reason
// TRANSPORT_COST_CATEGORY_OPTIONS in types/index.ts is restated rather
// than imported -- they live in a server-only module
// (transport-cost-lifecycle.service.ts), and the backend independently
// validates every patch key against its own copy, so a drift here fails
// loudly (a 400 from the server) rather than silently.
//
// SCOPE DECISION, documented rather than silently applied: this dialog
// exposes customerName/destinationTown/salesInvoiceNo/tonnageRaw (edit)
// and amount/date (correct) -- the highest-value, simplest-to-edit-
// safely fields of each list. `lines` (per-load editing) and
// costFacingCompany/contractedVehicleId/transporterPartnerId/vansales
// (identity/company/periodization fields, each of which needs its own
// search-select or specialised control -- see TransportCostImportPage's
// withSearchSelect machinery) are NOT yet exposed here. The backend
// endpoints already accept them (this is a frontend surface-coverage
// gap only, tracked in the gap-analysis doc, not a backend limitation)
// -- deliberately left out rather than half-built with a bare text input
// that could corrupt a confirmed identity or a multi-load operation.
//
// DECISION: confirmation uses window.confirm(), not a new dialog
// primitive -- discovered late in this slice that this codebase's actual
// established pattern for a destructive/consequential action
// (ExpenseListPage.handleDelete/handleBulkDelete) is a plain
// window.confirm() call, not a custom ConfirmDialog component (none
// exists anywhere in frontend/shared/ui). Building a new primitive this
// codebase doesn't otherwise use would be the wrong kind of "solve it
// once, generally" -- KISS/reuse-existing-patterns wins here. The
// Correct dialog's own body copy (not a confirm() popup) is where the
// spec's "explicitly explain the financial consequence" requirement is
// satisfied instead, since that needs more room than a one-line browser
// confirm affords.

'use client';

import { useEffect, useState } from 'react';
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
import type { TransportCostSourceRecord } from '@/shared/types/transport-cost.types';
import type { SourceRecordPatch } from '../types';

export type EditRecordDialogMode = 'edit' | 'correct';

interface EditRecordDialogProps {
  open: boolean;
  mode: EditRecordDialogMode;
  record: TransportCostSourceRecord | null;
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

export function EditRecordDialog({ open, mode, record, isSubmitting, onOpenChange, onSubmit }: EditRecordDialogProps) {
  const [customerName, setCustomerName] = useState('');
  const [destinationTown, setDestinationTown] = useState('');
  const [salesInvoiceNo, setSalesInvoiceNo] = useState('');
  const [tonnageRaw, setTonnageRaw] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record?._id]);

  if (!record) return null;

  async function handleSubmit() {
    if (!record) return;
    const patch: SourceRecordPatch = {};
    if (mode === 'edit') {
      if (customerName !== (record.customerName ?? '')) patch.customerName = customerName || undefined;
      if (destinationTown !== (record.destinationTown ?? '')) patch.destinationTown = destinationTown || undefined;
      if (salesInvoiceNo !== (record.salesInvoiceNo ?? '')) patch.salesInvoiceNo = salesInvoiceNo || undefined;
      const tonnageValue = tonnageRaw.trim() === '' ? undefined : Number(tonnageRaw);
      if (tonnageValue !== record.tonnageRaw) patch.tonnageRaw = tonnageValue;
    } else {
      const amountValue = amount.trim() === '' ? null : Number(amount);
      if (amountValue !== record.amount) patch.amount = amountValue as never;
      const dateValue = date ? new Date(`${date}T00:00:00.000Z`) : undefined;
      if (dateValue && toDateInputValue(dateValue) !== toDateInputValue(record.date)) {
        patch.date = dateValue;
      }
    }
    if (Object.keys(patch).length === 0) {
      onOpenChange(false);
      return;
    }
    await onSubmit(patch);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-form-wide">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit record' : 'Correct posted record'}</DialogTitle>
          <DialogDescription>
            {mode === 'edit' ? (
              <>Row {record.sourceRowNumber} &middot; {record.sourceFileName}. Non-financial fields only -- no ledger consequence.</>
            ) : (
              <>
                Row {record.sourceRowNumber} &middot; {record.sourceFileName}. This record is already posted to the
                finance ledger. Saving here will reverse the existing posting and create a new one for the corrected
                amount/date -- the original posting is never edited in place, and the net ledger effect is the
                corrected total, not the sum of both. This cannot be undone by closing this dialog once submitted.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {mode === 'edit' ? (
            <>
              <div className="space-y-1">
                <Label htmlFor="edit-customer-name">Customer name</Label>
                <Input id="edit-customer-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-destination-town">Destination town</Label>
                <Input id="edit-destination-town" value={destinationTown} onChange={(e) => setDestinationTown(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-sales-invoice-no">Sales invoice no</Label>
                <Input id="edit-sales-invoice-no" value={salesInvoiceNo} onChange={(e) => setSalesInvoiceNo(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-tonnage">Tonnage</Label>
                <Input id="edit-tonnage" type="number" value={tonnageRaw} onChange={(e) => setTonnageRaw(e.target.value)} />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor="correct-amount">Amount (corrected)</Label>
                <Input id="correct-amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <p className="text-caption text-muted-foreground">
                  Currently posted at {record.amount === null ? '—' : record.amount.toLocaleString()} {record.currency ?? ''}.
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="correct-date">Date</Label>
                <Input id="correct-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} variant={mode === 'correct' ? 'destructive' : 'default'}>
            {isSubmitting ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Reverse & repost corrected amount'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
