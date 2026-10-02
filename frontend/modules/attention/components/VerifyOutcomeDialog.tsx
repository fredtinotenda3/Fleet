// frontend/modules/attention/components/VerifyOutcomeDialog.tsx
//
// MODULE CONNECTIVITY UPGRADE -- "Attention/Actions ↔ Outcome
// Verification". Mirrors ResolveAttentionDialog's shape deliberately:
// same dialog/footer/loading pattern, same "this is a financial/
// operational record, not a UI nicety" discipline -- here applied to
// whether the fix actually held rather than to what it cost.
//
// WHY THIS ASKS FOR A CHOICE RATHER THAN A SINGLE CONFIRM BUTTON
// Resolving an item only ever records "this was dealt with" -- it says
// nothing about whether the underlying problem actually went away (see
// attention-outcome-addendum.ts for the full reasoning). Collapsing
// "verify" into a single always-success click would silently assume the
// fix held, which is exactly the fabricated-confidence failure mode the
// rest of this product's provenance work exists to avoid. A person who
// checked has to say what they found.

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
import { Label } from '@/frontend/shared/ui/forms/label';
import { Textarea } from '@/frontend/shared/ui/forms/textarea';
import { RadioGroup, RadioGroupItem } from '@/frontend/shared/ui/radio-group';
import type { AttentionItem } from '../types';
import type { VerifyAttentionOutcomeInput } from '../hooks/useAttentionActions';

interface VerifyOutcomeDialogProps {
  item: AttentionItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: VerifyAttentionOutcomeInput) => void;
  isSubmitting?: boolean;
}

export function VerifyOutcomeDialog({
  item,
  open,
  onOpenChange,
  onConfirm,
  isSubmitting = false,
}: VerifyOutcomeDialogProps) {
  const [outcome, setOutcome] = React.useState<'verified_resolved' | 'reopened'>('verified_resolved');
  const [note, setNote] = React.useState('');

  // Reset whenever a different item is opened, so one item's note can never
  // be submitted against another, and the default never carries over a
  // previous "reopened" choice onto a fresh item.
  React.useEffect(() => {
    if (open) {
      setOutcome('verified_resolved');
      setNote('');
    }
  }, [open, item?.itemKey]);

  if (!item) return null;

  const noteRequired = outcome === 'reopened';
  const noteMissing = noteRequired && note.trim().length === 0;

  const handleConfirm = () => {
    if (noteMissing) return;
    onConfirm({
      outcome,
      note: note.trim() === '' ? undefined : note.trim().slice(0, 2000),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Verify outcome</DialogTitle>
          <DialogDescription>
            Confirm whether the underlying problem is actually gone, now that this item has been
            resolved. This does not change the item&apos;s resolved status or its value-ledger entry.
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
            <Label>What did you find?</Label>
            <RadioGroup
              value={outcome}
              onValueChange={(value) => setOutcome(value as 'verified_resolved' | 'reopened')}
              className="mt-2"
            >
              <label className="flex items-start gap-2 text-body-sm">
                <RadioGroupItem value="verified_resolved" className="mt-0.5" />
                <span>
                  <span className="font-medium text-foreground">Confirmed resolved</span>
                  <span className="block text-caption text-muted-foreground">
                    Checked, and the underlying issue is actually gone.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-body-sm">
                <RadioGroupItem value="reopened" className="mt-0.5" />
                <span>
                  <span className="font-medium text-foreground">Still a problem</span>
                  <span className="block text-caption text-muted-foreground">
                    Checked, and the issue is still present or came back.
                  </span>
                </span>
              </label>
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="verify-outcome-note">
              Note {noteRequired && <span className="text-destructive">(required)</span>}
            </Label>
            <Textarea
              id="verify-outcome-note"
              value={note}
              maxLength={2000}
              rows={3}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                noteRequired
                  ? "What's still wrong, so the next person doesn't have to re-check from scratch."
                  : 'What you checked (optional).'
              }
              aria-invalid={noteMissing || undefined}
              aria-describedby="verify-outcome-note-hint"
            />
            <p id="verify-outcome-note-hint" className="mt-1 text-caption text-muted-foreground">
              {noteMissing
                ? 'A note explaining what is still wrong is required to reopen this outcome.'
                : 'Kept as the audit record of what was actually checked.'}
            </p>
          </div>

          {item.resolvedAt && (
            <p className="text-caption text-muted-foreground">
              Resolved {new Date(item.resolvedAt).toLocaleString()}
              {item.resolvedBy ? ` by ${item.resolvedBy}` : ''}.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting || noteMissing}>
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            Record outcome
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
