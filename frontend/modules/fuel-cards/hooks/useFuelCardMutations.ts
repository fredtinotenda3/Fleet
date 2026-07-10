// frontend/modules/fuel-cards/hooks/useFuelCardMutations.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fuelCardsApi } from '../services/fuel-cards.api';
import { fuelCardKeys } from './useFuelCards';
import type { FuelCardFormValues } from '../schemas';

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useCreateFuelCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: FuelCardFormValues) => fuelCardsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fuelCardKeys.all });
      toast.success('Fuel card added');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to add fuel card')),
  });
}

export function useUpdateFuelCard(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<FuelCardFormValues>) => fuelCardsApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fuelCardKeys.all });
      toast.success('Fuel card updated');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to update fuel card')),
  });
}

export function useDeleteFuelCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, soft = true }: { id: string; soft?: boolean }) => fuelCardsApi.remove(id, soft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fuelCardKeys.all });
      toast.success('Fuel card deleted');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to delete fuel card')),
  });
}