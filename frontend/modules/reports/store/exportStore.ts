// frontend/modules/reports/store/exportStore.ts
//
// Tracks execution ids the current user just kicked off, so Export Center
// can highlight/poll them immediately after reportExecutionsApi.generate()
// resolves, before the next reportExecutionsApi.list() refetch would
// otherwise surface them.
//
// FIX (Critical — infinite render loop / "getSnapshot should be cached"):
// getActiveIds() used to do `Array.from(this.activeExecutionIds)` inline,
// building a brand-new array reference on every single call. React's
// useSyncExternalStore requires getSnapshot to return the SAME reference
// between renders unless the underlying data actually changed — returning
// a new array every call makes every render look like a change, which is
// exactly the "getSnapshot should be cached" warning and the "Maximum
// update depth exceeded" crash seen in ExportCenter (via useExportJobs ->
// useActiveExportExecutionIds). Fixed by caching the array and only
// rebuilding it inside emit(), i.e. only when trackExecution/
// untrackExecution actually mutate the set.

import { useSyncExternalStore } from 'react';

type Listener = () => void;

class ExportStore {
  private activeExecutionIds = new Set<string>();
  private listeners = new Set<Listener>();
  private cachedIds: string[] = [];

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getActiveIds = (): string[] => this.cachedIds;

  private emit() {
    // Rebuild the cached snapshot exactly once per mutation, not once per
    // render/subscriber read.
    this.cachedIds = Array.from(this.activeExecutionIds);
    this.listeners.forEach((l) => l());
  }

  trackExecution(executionId: string) {
    if (this.activeExecutionIds.has(executionId)) return;
    this.activeExecutionIds.add(executionId);
    this.emit();
  }

  untrackExecution(executionId: string) {
    if (!this.activeExecutionIds.has(executionId)) return;
    this.activeExecutionIds.delete(executionId);
    this.emit();
  }
}

export const exportStore = new ExportStore();

export function useActiveExportExecutionIds(): string[] {
  return useSyncExternalStore(exportStore.subscribe, exportStore.getActiveIds, exportStore.getActiveIds);
}