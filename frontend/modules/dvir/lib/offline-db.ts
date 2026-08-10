// frontend/modules/dvir/lib/offline-db.ts
//
// Tiny hand-rolled IndexedDB wrapper -- deliberately no external
// dependency (idb, dexie, etc). One object store, keyed by
// clientInspectionId, holding queued DVIR submissions that couldn't
// reach the server yet.

import type { DVIRQueuedSubmission } from '../types';

const DB_NAME = 'fleet-dvir-offline';
const DB_VERSION = 1;
const STORE_NAME = 'queued-inspections';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isBrowser()) {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'clientInspectionId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open offline DVIR database'));
  });
}

export async function enqueueInspection(submission: DVIRQueuedSubmission): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(submission);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function updateQueuedInspection(submission: DVIRQueuedSubmission): Promise<void> {
  return enqueueInspection(submission);
}

export async function removeQueuedInspection(clientInspectionId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(clientInspectionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listQueuedInspections(): Promise<DVIRQueuedSubmission[]> {
  if (!isBrowser()) return [];
  try {
    const db = await openDb();
    const items = await new Promise<DVIRQueuedSubmission[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result as DVIRQueuedSubmission[]) || []);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return items.sort((a, b) => a.queuedAt - b.queuedAt);
  } catch {
    // IndexedDB unavailable (private browsing, unsupported browser) --
    // degrade to "no queue", so a submission just goes through the
    // normal immediate-post path with no offline fallback.
    return [];
  }
}
