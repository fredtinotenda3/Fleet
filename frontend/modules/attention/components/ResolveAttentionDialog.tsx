// frontend/modules/attention/components/ResolveAttentionDialog.tsx

'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/frontend/shared/ui/feedback/dialog';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Textarea } from '@/frontend/shared/ui/forms/textarea';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { NeedsAttentionItem } from '../types';
import type { ResolveAttentionInput } from '../hooks/useAttentionActions';

interface ResolveAttentionDialogProps {
  item: NeedsAttentionItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: ResolveAttentionInput) => void;
  isSubmitting?: boolean;
}

/**
 * "What actually happened?" — the last step of the loop.
 *
 * Resolving an item posts to the value ledger, which is what the savings
 * strip on this same page totals. That makes `realisedAmount` a financial
 * figure, not a UI nicety, and it is why this is a dialog rather than a
 * one-click action: the modelled cost is an estimate, and silently posting
 * the estimate as though it were the confirmed outcome would put fabricated
 * numbers into a ledger someone reconciles.
 *
 * Leaving the field blank is a real and safe choice — the backend falls back
 * to the item's modelled cost, and the placeholder says so. What matters is
 * that overriding it is possible and deliberate.
 *
 * Both optional fields map onto `resolveAttentionItemSchema`
 * (shared/validations/attention.schema.ts). `notes` is capped there at 2000
 * characters; the same cap is applied on the input so the limit is visible
 * before submission rather than arriving as a validation error.
 */
export function ResolveAttentionDialog({
  item,
  open,
  onOpenChange,
  onConfirm,
  isSubmitting = false,
}: ResolveAttentionDialogProps) {
  const [realisedAmount, setRealisedAmount] = React.useState('');
  const [notes, setNotes] = React.useState('');

  // Reset whenever a different item is opened, so one item's notes can never
  // be submitted against another.
  React.useEffect(() => {
    if (open) {
      setRealisedAmount('');
      setNotes('');
    }
  }, [open, item?.id]);

  if (!item) return null;

  const parsedAmount = realisedAmount.trim() === '' ? undefined : Number(realisedAmount);
  const amountInvalid =
    parsedAmount !== undefined && (!Number.isFinite(parsedAmount) || parsedAmount < 0);

  const handleConfirm = () => {
    if (amountInvalid) return;
    onConfirm({
      realisedAmount: parsedAmount,
      notes: notes.trim() === '' ? undefined : notes.trim().slice(0, 2000),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resolve this item</DialogTitle>
          <DialogDescription>
            Records that this finding has been dealt with and posts the outcome to this month&apos;s
            value ledger.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <p className="text-body-sm font-medium text-foreground">{item.title}</p>
            {item.entityLabel && (
              <p className="mt-0.5 text-caption text-muted-foreground">{item.entityLabel}</p>
            )}
          </div>

          <div>
            <Label htmlFor="resolve-realised-amount">Confirmed amount</Label>
            <Input
              id="resolve-realised-amount"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={realisedAmount}
              onChange={(event) => setRealisedAmount(event.target.value)}
              placeholder={
                item.cost > 0
                  ? `Leave blank to use the modelled ${formatCurrency(item.cost)}`
                  : 'Leave blank if not applicable'
              }
              aria-invalid={amountInvalid || undefined}
              aria-describedby="resolve-realised-amount-hint"
            />
            <p id="resolve-realised-amount-hint" className="mt-1 text-caption text-muted-foreground">
              {amountInvalid
                ? 'Enter a positive amount, or leave the field blank.'
                : 'What this actually cost or saved, if it differed from the estimate.'}
            </p>
          </div>

          <div>
            <Label htmlFor="resolve-notes">Notes</Label>
            <Textarea
              id="resolve-notes"
              value={notes}
              maxLength={2000}
              rows={3}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="What was checked, and what was done about it."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting || amountInvalid}>
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            Resolve item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
