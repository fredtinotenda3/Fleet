// frontend/modules/workorders/components/ConsumePartsDialog.tsx
//
// ---------------------------------------------------------------------
// THE MISSING LAST MILE
// ---------------------------------------------------------------------
// `POST /api/workorders/[id]/parts` has always existed, and behind it
// `WorkOrderService.consumeParts` moves real stock through
// InventoryService and recalculates the job's partsCost and totalCost.
// Nothing in the application ever called it. The work order detail page
// showed a Costs card whose Parts line was permanently zero, because
// there was no way to make it anything else.
//
// ---------------------------------------------------------------------
// WHAT THIS DIALOG REFUSES TO DO
// ---------------------------------------------------------------------
//   * It does not let a mechanic type a part id. The server takes a
//     `sparePartId`, and a free-text field there is how you consume the
//     wrong part's stock. The picker only offers parts the caller can
//     actually read (GET /api/inventory is INVENTORY_VIEW and
//     tenant-scoped server-side).
//   * It does not offer parts with no stock on hand, and it caps the
//     quantity at what is on hand. The server enforces this too --
//     `InventoryService.consumeStock` is the authority and will refuse
//     an over-draw -- but a form that lets someone submit a number the
//     server will reject is a form that wastes their time.
//   * It shows the line cost BEFORE submitting, computed from the same
//     `unitCost * quantity` the server uses, so the number that appears
//     on the work order is not a surprise.
//
// One part per submission, matching the endpoint. Batching would need a
// transactional multi-part endpoint that does not exist, and faking it
// with N sequential requests would leave a half-recorded job on the
// first failure -- with stock already moved for the parts that
// succeeded.

'use client';

import { useState } from 'react';
import { PackageSearch } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Button } from '@/frontend/shared/ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { useSpareParts } from '@/frontend/modules/inventory/hooks';
import type { WorkOrder } from '../types';

interface ConsumePartsDialogProps {
  open: boolean;
  workOrder: WorkOrder;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { sparePartId: string; quantity: number }) => Promise<unknown>;
  isSubmitting?: boolean;
}

export function ConsumePartsDialog({
  open,
  workOrder,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: ConsumePartsDialogProps) {
  const [sparePartId, setSparePartId] = useState('');
  const [quantity, setQuantity] = useState('1');

  // Only fetched once the dialog is actually open — see useSpareParts.
  const { data, isLoading, isError } = useSpareParts({ limit: 200 }, open);

  const parts = data?.data ?? [];
  const inStock = parts.filter((p) => p.quantityOnHand > 0);
  const selected = parts.find((p) => p._id === sparePartId);

  const parsedQuantity = Number.parseInt(quantity, 10);
  const quantityIsValid =
    Number.isInteger(parsedQuantity) &&
    parsedQuantity > 0 &&
    (!selected || parsedQuantity <= selected.quantityOnHand);

  const lineCost = selected && quantityIsValid ? selected.unitCost * parsedQuantity : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !quantityIsValid) return;
    await onSubmit({ sparePartId, quantity: parsedQuantity });
    setSparePartId('');
    setQuantity('1');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record parts used</DialogTitle>
          <DialogDescription>
            Consumes stock against &quot;{workOrder.title}&quot; ({workOrder.license_plate}) and
            adds the cost to this job.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <LoadingState type="card" count={2} />
        ) : isError ? (
          /*
            Distinguished from "no parts": the absence of a result here
            proves nothing, and a mechanic told "no parts in stock" over
            a failed request goes looking in the storeroom.
          */
          <EmptyState
            icon={<PackageSearch aria-hidden="true" />}
            title="Couldn't load the parts catalogue"
            description="The request failed, so this is not a report that there are no parts. Try again in a moment."
          />
        ) : inStock.length === 0 ? (
          <EmptyState
            icon={<PackageSearch aria-hidden="true" />}
            title={parts.length === 0 ? 'No spare parts recorded' : 'Nothing in stock'}
            description={
              parts.length === 0
                ? 'Parts must exist in inventory before they can be consumed against a work order.'
                : 'Every part in the catalogue is at zero on hand, so none can be consumed yet.'
            }
          />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sparePartId">Part *</Label>
              {/* The shared Select emits `string | null` on clear. */}
              <Select value={sparePartId} onValueChange={(value) => setSparePartId(value ?? '')}>
                <SelectTrigger id="sparePartId" className="w-full">
                  <SelectValue placeholder="Select a part" />
                </SelectTrigger>
                <SelectContent>
                  {inStock.map((part) => (
                    <SelectItem key={part._id} value={part._id}>
                      {part.name} — {part.sku} ({part.quantityOnHand} on hand)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                max={selected?.quantityOnHand}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                aria-describedby="quantity-hint"
              />
              <p id="quantity-hint" className="text-caption text-muted-foreground">
                {selected
                  ? `${selected.quantityOnHand} on hand at ${formatCurrency(selected.unitCost)} each.`
                  : 'Select a part to see what is on hand.'}
              </p>
              {selected && !quantityIsValid && (
                <p role="alert" className="text-caption text-danger">
                  Enter a whole number between 1 and {selected.quantityOnHand}.
                </p>
              )}
            </div>

            {lineCost !== null && (
              <div className="flex justify-between px-3 py-2 rounded-md bg-muted text-body-sm">
                <span className="text-muted-foreground">Adds to this job</span>
                <span className="font-medium tabular-nums">{formatCurrency(lineCost)}</span>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!selected || !quantityIsValid || isSubmitting}>
                {isSubmitting ? 'Recording…' : 'Record parts'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
