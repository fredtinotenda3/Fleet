// frontend/modules/transport-cost/hooks/useTransportCostMutations.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 5. Same pattern as
// frontend/modules/expenses/hooks/useExpenseMutations.ts (useMutation +
// useQueryClient + sonner toast + a local errMsg fallback), applied to
// the O2 review queue and the new operational-record CRUD commands.
// Every mutation invalidates transportCostKeys.all on success -- the
// same blunt-but-correct invalidation useExpenseMutations uses, rather
// than hand-listing which of source-records/statuses/operationalRecord/
// commandCentreSummary/normalizationReviewQueue a given action could
// affect (a Correct or Cancel-of-posted changes the Command Centre
// summary too, not just the record's own row -- see task #62 -- so
// under-invalidating here is the real risk, not over-invalidating).

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { transportCostApi } from '../services/transport-cost.api';
import { transportCostKeys } from './useTransportCost';
import type { SourceRecordPatch, BusinessStream } from '../types';

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

// ── Phase O2 review queue. ──────────────────────────────────────────

export function useConfirmReviewMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewItemId, resolvedEntityId }: { reviewItemId: string; resolvedEntityId: string }) =>
      transportCostApi.confirmReviewMatch(reviewItemId, resolvedEntityId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: transportCostKeys.all });
      toast.success(`Confirmed match -- ${result.sourceRecordsUpdated} record(s) updated`);
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to confirm match')),
  });
}

export function useConfirmReviewNew() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      reviewItemId,
      transporterPartnerId,
      businessStream,
    }: {
      reviewItemId: string;
      transporterPartnerId?: string;
      businessStream?: BusinessStream;
    }) => transportCostApi.confirmReviewNew(reviewItemId, transporterPartnerId, businessStream),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: transportCostKeys.all });
      toast.success(`Created new identity -- ${result.sourceRecordsUpdated} record(s) updated`);
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to confirm as new')),
  });
}

export function useRejectReviewItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewItemId, reason }: { reviewItemId: string; reason: string }) =>
      transportCostApi.rejectReviewItem(reviewItemId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transportCostKeys.all });
      toast.success('Review item rejected');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to reject review item')),
  });
}

// ── Slice 5: operational record CRUD. ───────────────────────────────

export function useEditSourceRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceRecordId, patch }: { sourceRecordId: string; patch: SourceRecordPatch }) =>
      transportCostApi.editSourceRecord(sourceRecordId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transportCostKeys.all });
      toast.success('Record updated');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to update record')),
  });
}

/** Correct: the only way to change a financial field on a POSTED
 *  record -- reverses the live posting and reposts. Success/error
 *  messaging is deliberately more specific than a plain "updated" toast
 *  (see the gap-analysis doc's Section 8.4): a financial correction
 *  should tell the person what actually happened to the ledger, not
 *  just that the request succeeded. */
export function useCorrectPostedSourceRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceRecordId, patch }: { sourceRecordId: string; patch: SourceRecordPatch }) =>
      transportCostApi.correctPostedSourceRecord(sourceRecordId, patch),
    onSuccess: ({ outcome }) => {
      queryClient.invalidateQueries({ queryKey: transportCostKeys.all });
      if (outcome.status === 'corrected') {
        toast.success(
          `Correction posted -- reversed ${outcome.reversal.reportingAmount.toLocaleString()} and posted ${outcome.posting.reportingAmount.toLocaleString()}`
        );
      } else if (outcome.status === 'skipped') {
        toast.warning(`Saved, but could not repost yet: ${outcome.detail}`);
      } else {
        toast.success('Correction saved');
      }
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to correct record')),
  });
}

export function useCancelSourceRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceRecordId, reason }: { sourceRecordId: string; reason: string }) =>
      transportCostApi.cancelSourceRecord(sourceRecordId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transportCostKeys.all });
      toast.success('Record cancelled');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to cancel record')),
  });
}

export function useDuplicateSourceRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sourceRecordId: string) => transportCostApi.duplicateSourceRecord(sourceRecordId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transportCostKeys.all });
      toast.success('Record duplicated');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to duplicate record')),
  });
}
