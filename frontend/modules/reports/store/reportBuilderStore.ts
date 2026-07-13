// frontend/modules/reports/store/reportBuilderStore.ts
//
// Holds the in-progress, unsaved report-definition draft while the user
// works through the builder steps (columns -> filters -> group by -> sort ->
// preview -> save). Implemented as a plain external store (no state-
// management dependency assumed) consumed via React's built-in
// useSyncExternalStore, so it works regardless of which state library (if
// any) the rest of the app has installed.

import { useSyncExternalStore } from 'react';
import {
  defaultReportDefinitionForm,
  type ReportDefinitionForm,
} from '../schemas/reportDefinition';
import type { ReportColumn } from '../schemas/reportColumn';
import type { ReportFilterCondition, ReportFilterGroup } from '../schemas/reportFilter';
import type { ReportSort } from '../schemas/reportDefinition';

type Listener = () => void;

class ReportBuilderStore {
  private state: ReportDefinitionForm = { ...defaultReportDefinitionForm };
  private listeners = new Set<Listener>();
  private dirty = false;

  getState = (): ReportDefinitionForm => this.state;
  isDirty = (): boolean => this.dirty;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit() {
    this.dirty = true;
    this.listeners.forEach((l) => l());
  }

  reset(initial?: Partial<ReportDefinitionForm>) {
    this.state = { ...defaultReportDefinitionForm, ...initial };
    this.dirty = false;
    this.listeners.forEach((l) => l());
  }

  loadDefinition(definition: ReportDefinitionForm) {
    this.state = definition;
    this.dirty = false;
    this.listeners.forEach((l) => l());
  }

  setName(name: string) {
    this.state = { ...this.state, name };
    this.emit();
  }

  setDescription(description: string) {
    this.state = { ...this.state, description };
    this.emit();
  }

  setDataSource(dataSource: ReportDefinitionForm['dataSource']) {
    this.state = { ...this.state, dataSource, columns: [] as unknown as ReportColumn[], filters: { logic: 'and', conditions: [] } };
    this.emit();
  }

  setColumns(columns: ReportColumn[]) {
    this.state = { ...this.state, columns };
    this.emit();
  }

  toggleColumn(column: ReportColumn) {
    const exists = this.state.columns.some((c) => c.id === column.id);
    const columns = exists
      ? this.state.columns.filter((c) => c.id !== column.id)
      : [...this.state.columns, column];
    this.state = { ...this.state, columns };
    this.emit();
  }

  reorderColumns(columns: ReportColumn[]) {
    this.state = { ...this.state, columns };
    this.emit();
  }

  setFilters(filters: ReportFilterGroup) {
    this.state = { ...this.state, filters };
    this.emit();
  }

  addFilterCondition(condition: ReportFilterCondition) {
    this.state = {
      ...this.state,
      filters: { ...this.state.filters, conditions: [...this.state.filters.conditions, condition] },
    };
    this.emit();
  }

  removeFilterCondition(conditionId: string) {
    this.state = {
      ...this.state,
      filters: {
        ...this.state.filters,
        conditions: this.state.filters.conditions.filter((c) => c.id !== conditionId),
      },
    };
    this.emit();
  }

  setGroupBy(groupBy: string[]) {
    this.state = { ...this.state, groupBy };
    this.emit();
  }

  setSort(sort: ReportSort[]) {
    this.state = { ...this.state, sort };
    this.emit();
  }

  setPivot(config: Pick<ReportDefinitionForm, 'isPivot' | 'pivotRowField' | 'pivotColumnField' | 'pivotValueField'>) {
    this.state = { ...this.state, ...config };
    this.emit();
  }
}

export const reportBuilderStore = new ReportBuilderStore();

export function useReportBuilderStore(): ReportDefinitionForm {
  return useSyncExternalStore(reportBuilderStore.subscribe, reportBuilderStore.getState, reportBuilderStore.getState);
}

export function useReportBuilderDirty(): boolean {
  return useSyncExternalStore(
    reportBuilderStore.subscribe,
    reportBuilderStore.isDirty,
    reportBuilderStore.isDirty,
  );
}