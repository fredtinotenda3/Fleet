// frontend/modules/reports/store/scheduleStore.ts
//
// Holds the in-progress "new schedule" draft while the user fills out
// ScheduleConfigForm, separate from server state (which lives in the
// scheduled-job list fetched by useScheduledReports).

import { useSyncExternalStore } from 'react';
import { defaultScheduleConfig, type ScheduleConfigForm } from '../schemas/scheduleConfig';

type Listener = () => void;

class ScheduleStore {
  private draft: Partial<ScheduleConfigForm> = { ...defaultScheduleConfig };
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getDraft = (): Partial<ScheduleConfigForm> => this.draft;

  private emit() {
    this.listeners.forEach((l) => l());
  }

  update(patch: Partial<ScheduleConfigForm>) {
    this.draft = { ...this.draft, ...patch };
    this.emit();
  }

  reset() {
    this.draft = { ...defaultScheduleConfig };
    this.emit();
  }
}

export const scheduleStore = new ScheduleStore();

export function useScheduleDraft(): Partial<ScheduleConfigForm> {
  return useSyncExternalStore(scheduleStore.subscribe, scheduleStore.getDraft, scheduleStore.getDraft);
}