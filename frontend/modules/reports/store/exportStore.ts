// frontend/modules/reports/store/exportStore.ts
//
// Tracks execution ids the current user just kicked off, so Export Center
// can highlight/poll them immediately after reportExecutionsApi.generate()
// resolves, before the next reportExecutionsApi.list() refetch would
// otherwise surface them.

import { useSyncExternalStore } from 'react';

type Listener = () => void;

class ExportStore {
  private activeExecutionIds = new Set<string>();
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getActiveIds = (): string[] => Array.from(this.activeExecutionIds);

  private emit() {
    this.listeners.forEach((l) => l());
  }

  trackExecution(executionId: string) {
    this.activeExecutionIds.add(executionId);
    this.emit();
  }

  untrackExecution(executionId: string) {
    this.activeExecutionIds.delete(executionId);
    this.emit();
  }
}

export const exportStore = new ExportStore();

export function useActiveExportExecutionIds(): string[] {
  return useSyncExternalStore(exportStore.subscribe, exportStore.getActiveIds, exportStore.getActiveIds);
}