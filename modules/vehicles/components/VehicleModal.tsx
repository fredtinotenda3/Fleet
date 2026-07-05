'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import VehicleForm from './VehicleForm';
import { Vehicle } from '@/shared/types/vehicle.types';

interface VehicleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: Vehicle | null;
  onSuccess: () => void;
}

export function VehicleModal({ open, onOpenChange, vehicle, onSuccess }: VehicleModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vehicle ? 'Edit Vehicle' : 'Add New Vehicle'}</DialogTitle>
        </DialogHeader>
        <VehicleForm
          vehicle={
            vehicle
              ? {
                  ...vehicle,
                  status: vehicle.status as 'active' | 'inactive' | 'maintenance',
                }
              : undefined
          }
          onSuccess={() => {
            onSuccess();
            onOpenChange(false);
          }}
          closeModal={() => onOpenChange(false)}
          refresh={onSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}