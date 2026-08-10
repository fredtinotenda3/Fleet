// frontend/modules/dvir/lib/sync.ts
//
// Drains the offline DVIR queue whenever the device is (or becomes)
// online. Each queued submission carries a stable clientInspectionId
// minted at capture time -- POST /api/dvir treats a resubmission of the
// same id as a no-op that returns the original result (see
// DVIRService.submit's idempotency check), so it's safe to retry a
// queued item that may have actually succeeded server-side but lost
// its response in transit.
//
// True Background Sync API (ServiceWorkerRegistration.sync) isn't
// available on every browser (notably Safari/iOS), so the primary sync
// path here is client-driven: flush on mount, on the 'online' event,
// and on a light periodic timer while the tab is open. The service
// worker (public/sw.js) registers a 'sync' event as a progressive
// enhancement for the browsers that do support it, which calls back
// into this same flush function via postMessage.

import { enqueueInspection, listQueuedInspections, removeQueuedInspection, updateQueuedInspection } from './offline-db';
import type { DVIRQueuedSubmission } from '../types';

type Listener = (pendingCount: number) => void;

const listeners = new Set<Listener>();
let flushing = false;

function notify(count: number) {
  listeners.forEach((l) => l(count));
}

export function subscribePendingCount(listener: Listener): () => void {
  listeners.add(listener);
  refreshPendingCount();
  return () => listeners.delete(listener);
}

export async function refreshPendingCount(): Promise<number> {
  const items = await listQueuedInspections();
  notify(items.length);
  return items.length;
}

export async function discardQueuedInspection(clientInspectionId: string): Promise<void> {
  await removeQueuedInspection(clientInspectionId);
  await refreshPendingCount();
}

export async function getQueuedInspections() {
  return listQueuedInspections();
}

export async function queueInspection(submission: DVIRQueuedSubmission): Promise<void> {
  await enqueueInspection(submission);
  await refreshPendingCount();
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    void flushQueue();
  }
}

/**
 * Attempts to submit every queued inspection. Runs at most one flush
 * at a time (re-entrant calls -- e.g. an 'online' event firing while a
 * flush from mount is still in flight -- are no-ops); items that fail
 * stay queued with an incremented attempt counter and last error for
 * the UI to surface.
 */
export async function flushQueue(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  flushing = true;
  try {
    const items = await listQueuedInspections();
    for (const item of items) {
      if (item.permanentFailure) continue;
      try {
        const res = await fetch('/api/dvir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            license_plate: item.license_plate,
            type: item.type,
            odometer: item.odometer,
            outOfService: item.outOfService,
            items: item.items,
            clientInspectionId: item.clientInspectionId,
          }),
        });
        if (res.ok) {
          await removeQueuedInspection(item.clientInspectionId);
        } else if (res.status >= 400 && res.status < 500) {
          // Not a connectivity problem (validation/auth/scope error) --
          // retrying identical bytes will never succeed. Don't delete
          // it though: a dropped defect report is a safety issue, not
          // just an inconvenience. Mark it so the queue stops retrying
          // and the driver sees it (via the pending list) with the
          // reason, and can re-capture or explicitly discard it.
          const body = await res.json().catch(() => ({}));
          const updated: DVIRQueuedSubmission = {
            ...item,
            attempts: item.attempts + 1,
            lastError: body?.error?.message || `Rejected (${res.status})`,
            permanentFailure: true,
          };
          await updateQueuedInspection(updated);
        } else {
          const updated: DVIRQueuedSubmission = {
            ...item,
            attempts: item.attempts + 1,
            lastError: `Server error ${res.status}`,
          };
          await updateQueuedInspection(updated);
        }
      } catch (error) {
        const updated: DVIRQueuedSubmission = {
          ...item,
          attempts: item.attempts + 1,
          lastError: error instanceof Error ? error.message : 'Network error',
        };
        await updateQueuedInspection(updated);
        // A network-level failure on one item means we're almost
        // certainly still offline -- stop trying the rest this pass.
        break;
      }
    }
  } finally {
    flushing = false;
    await refreshPendingCount();
  }
}

export function initDVIRSync(): () => void {
  if (typeof window === 'undefined') return () => {};

  void flushQueue();
  const onOnline = () => void flushQueue();
  window.addEventListener('online', onOnline);

  const interval = window.setInterval(() => void flushQueue(), 60_000);

  return () => {
    window.removeEventListener('online', onOnline);
    window.clearInterval(interval);
  };
}
