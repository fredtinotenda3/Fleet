// frontend/modules/workorders/components/RecordLaborDialog.tsx
//
// The other half of the workshop dead-end. `POST
// /api/workorders/[id]/labor` was live and uncalled, so the Costs
// card's Labor line was permanently zero for every work order.
//
// ---------------------------------------------------------------------
// IT REPLACES, IT DOES NOT ADD
// ---------------------------------------------------------------------
// `WorkOrderService.recordLabor` does:
//
//     laborCost = laborHours * hourlyRate
//     totalCost = existing.partsCost + laborCost
//
// It SETS the figures rather than accumulating them, so submitting
// twice does not double the labour — the second submission replaces the
// first. That is a defensible model (a job has one labour total, revised
// as work proceeds), but a dialog that said "add labour" over
// replacement semantics would silently lose hours the moment anyone
// used it twice. So the wording, the prefilled values and the hint all
// say replace, and the existing figures are shown as the starting point.
//
// The hourly rate is deliberately not defaulted to a constant. There is
// no labour-rate setting anywhere in the platform, and inventing one
// here would put a fabricated number into a customer's job costing.
// Where a rate has already been recorded on this job it is prefilled;
// otherwise the field starts empty and the mechanic supplies it.

'use client';

import { useEffect, useState } from 'react';
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
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { WorkOrder } from '../types';

interface RecordLaborDialogProps {
  open: boolean;
  workOrder: WorkOrder;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { laborHours: number; hourlyRate: number }) => Promise<unknown>;
  isSubmitting?: boolean;
}

/** Derives the rate already implied by the job, when there is one. */
function existingRate(workOrder: WorkOrder): string {
  const hours = workOrder.laborHours ?? 0;
  const cost = workOrder.laborCost ?? 0;
  if (hours > 0 && cost > 0) return String(Math.round((cost / hours) * 100) / 100);
  return '';
}

export function RecordLaborDialog({
  open,
  workOrder,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: RecordLaborDialogProps) {
  const [hours, setHours] = useState('');
  const [rate, setRate] = useState('');

  // Re-seeded each time the dialog opens, so it reflects the job as it
  // stands now rather than as it stood when the page first rendered.
  useEffect(() => {
    if (open) {
      setHours(workOrder.laborHours ? String(workOrder.laborHours) : '');
      setRate(existingRate(workOrder));
    }
  }, [open, workOrder]);

  const parsedHours = Number.parseFloat(hours);
  const parsedRate = Number.parseFloat(rate);
  const hoursValid = Number.isFinite(parsedHours) && parsedHours > 0;
  const rateValid = Number.isFinite(parsedRate) && parsedRate > 0;
  const valid = hoursValid && rateValid;

  const newLaborCost = valid ? parsedHours * parsedRate : null;
  const newTotal = newLaborCost === null ? null : (workOrder.partsCost ?? 0) + newLaborCost;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;
    await onSubmit({ laborHours: parsedHours, hourlyRate: parsedRate });
    onOpenChange(false);
  }

  const hasExisting = (workOrder.laborHours ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{hasExisting ? 'Revise labour' : 'Record labour'}</DialogTitle>
          <DialogDescription>
            {hasExisting
              ? `Replaces the ${workOrder.laborHours} hours currently recorded against "${workOrder.title}".`
              : `Labour hours and rate for "${workOrder.title}" (${workOrder.license_plate}).`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="laborHours">Hours *</Label>
            <Input
              id="laborHours"
              type="number"
              min={0}
              step="0.25"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
            {hours !== '' && !hoursValid && (
              <p role="alert" className="text-caption text-danger">
                Hours must be greater than zero.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hourlyRate">Hourly rate *</Label>
            <Input
              id="hourlyRate"
              type="number"
              min={0}
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              aria-describedby="rate-hint"
            />
            <p id="rate-hint" className="text-caption text-muted-foreground">
              The platform records no default labour rate, so this is entered per job.
            </p>
            {rate !== '' && !rateValid && (
              <p role="alert" className="text-caption text-danger">
                Rate must be greater than zero.
              </p>
            )}
          </div>

          {newLaborCost !== null && (
            <div className="px-3 py-2 space-y-1 rounded-md bg-muted text-body-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Labour</span>
                <span className="font-medium tabular-nums">{formatCurrency(newLaborCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Parts (unchanged)</span>
                <span className="tabular-nums">{formatCurrency(workOrder.partsCost ?? 0)}</span>
              </div>
              <div className="flex justify-between pt-1 font-semibold border-t border-border">
                <span>New job total</span>
                <span className="tabular-nums">{formatCurrency(newTotal ?? 0)}</span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || isSubmitting}>
              {isSubmitting ? 'Saving…' : hasExisting ? 'Replace labour' : 'Record labour'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
