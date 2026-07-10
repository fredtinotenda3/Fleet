// frontend/modules/fuel-cards/pages/FuelCardsListPage.tsx

'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useFuelCardsList } from '../hooks/useFuelCards';
import { useCreateFuelCard, useUpdateFuelCard, useDeleteFuelCard } from '../hooks/useFuelCardMutations';
import { FuelCardsTable, FuelCardModal, type FuelCardModalMode } from '../components';
import { canManageFuel } from '@/frontend/modules/fuel/utils';
import { FUEL_ROUTES } from '@/frontend/modules/fuel/routes';
import type { FuelCard } from '../types';
import type { FuelCardFormValues } from '../schemas';

export function FuelCardsListPage() {
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageFuel(roles);

  const { data: result, isLoading } = useFuelCardsList();
  const createCard = useCreateFuelCard();
  const [activeCard, setActiveCard] = useState<FuelCard | null>(null);
  const [modalMode, setModalMode] = useState<FuelCardModalMode>('create');
  const [modalOpen, setModalOpen] = useState(false);
  const updateCard = useUpdateFuelCard(activeCard?._id ?? '');
  const deleteCard = useDeleteFuelCard();

  function openCreate() {
    setModalMode('create');
    setActiveCard(null);
    setModalOpen(true);
  }

  function openEdit(card: FuelCard) {
    setModalMode('edit');
    setActiveCard(card);
    setModalOpen(true);
  }

  async function handleSubmit(values: FuelCardFormValues) {
    if (modalMode === 'edit' && activeCard?._id) {
      await updateCard.mutateAsync(values);
    } else {
      await createCard.mutateAsync(values);
    }
  }

  async function handleDelete(card: FuelCard) {
    if (!card._id) return;
    if (!window.confirm(`Delete fuel card ending in ${card.card_last4}?`)) return;
    await deleteCard.mutateAsync({ id: card._id, soft: true });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fuel cards"
        description="Manage the fuel cards issued to your fleet."
        breadcrumbs={[{ label: 'Fuel', href: FUEL_ROUTES.dashboard }, { label: 'Cards' }]}
        actions={
          canManage ? (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> Add card
            </Button>
          ) : undefined
        }
      />

      <div className="p-4 surface-card">
        <FuelCardsTable
          cards={result?.data ?? []}
          isLoading={isLoading}
          onEdit={openEdit}
          onDelete={handleDelete}
          canManage={canManage}
        />
      </div>

      <FuelCardModal open={modalOpen} mode={modalMode} card={activeCard} onOpenChange={setModalOpen} onSubmit={handleSubmit} />
    </div>
  );
}