// frontend/modules/fuel-cards/components/FuelCardModal.tsx

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { FuelCardForm } from './FuelCardForm';
import type { FuelCard } from '../types';
import type { FuelCardFormValues } from '../schemas';

export type FuelCardModalMode = 'create' | 'edit';

interface FuelCardModalProps {
  open: boolean;
  mode: FuelCardModalMode;
  card?: FuelCard | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: FuelCardFormValues) => Promise<unknown>;
}

export function FuelCardModal({ open, mode, card, onOpenChange, onSubmit }: FuelCardModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-form-wide">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit fuel card' : 'Add fuel card'}</DialogTitle>
          <DialogDescription>
            {mode === 'edit' ? "Update this card's details." : 'Register a fuel card issued to your fleet.'}
          </DialogDescription>
        </DialogHeader>
        <FuelCardForm
          key={`${mode}-${card?._id ?? 'new'}`}
          defaultValues={
            card
              ? {
                  card_last4: card.card_last4,
                  provider: card.provider,
                  currency: card.currency,
                  license_plate: card.license_plate ?? '',
                  monthly_limit: card.monthly_limit,
                  status: card.status,
                  expiry_date: card.expiry_date ? new Date(card.expiry_date).toISOString().slice(0, 10) : '',
                  notes: card.notes ?? '',
                }
              : undefined
          }
          onSubmit={async (values) => {
            await onSubmit(values);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
          submitLabel={mode === 'edit' ? 'Save changes' : 'Add card'}
        />
      </DialogContent>
    </Dialog>
  );
}