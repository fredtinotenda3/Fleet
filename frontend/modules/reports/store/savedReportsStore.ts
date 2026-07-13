// frontend/modules/reports/store/savedReportsStore.ts
//
// Lightweight client cache of saved report definitions plus UI-only state
// (favorites, recently viewed) that doesn't belong in server state. The
// authoritative list still comes from reportDefinitionsApi.list(); this
// store only layers favorite/recent bookkeeping on top so it survives
// navigation between builder/preview screens without a refetch.

import { useSyncExternalStore } from 'react';

const FAVORITES_STORAGE_KEY = 'reports.savedReports.favoriteIds';
const RECENT_STORAGE_KEY = 'reports.savedReports.recentIds';
const MAX_RECENT = 10;

function readIds(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Favorites/recents are non-critical UX state; ignore storage failures.
  }
}

type Listener = () => void;

class SavedReportsStore {
  private favoriteIds: string[] = readIds(FAVORITES_STORAGE_KEY);
  private recentIds: string[] = readIds(RECENT_STORAGE_KEY);
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getFavoriteIds = () => this.favoriteIds;
  getRecentIds = () => this.recentIds;

  private emit() {
    this.listeners.forEach((l) => l());
  }

  toggleFavorite(reportId: string) {
    this.favoriteIds = this.favoriteIds.includes(reportId)
      ? this.favoriteIds.filter((id) => id !== reportId)
      : [...this.favoriteIds, reportId];
    writeIds(FAVORITES_STORAGE_KEY, this.favoriteIds);
    this.emit();
  }

  isFavorite(reportId: string) {
    return this.favoriteIds.includes(reportId);
  }

  markRecentlyViewed(reportId: string) {
    this.recentIds = [reportId, ...this.recentIds.filter((id) => id !== reportId)].slice(0, MAX_RECENT);
    writeIds(RECENT_STORAGE_KEY, this.recentIds);
    this.emit();
  }
}

export const savedReportsStore = new SavedReportsStore();

export function useFavoriteReportIds(): string[] {
  return useSyncExternalStore(
    savedReportsStore.subscribe,
    savedReportsStore.getFavoriteIds,
    savedReportsStore.getFavoriteIds,
  );
}

export function useRecentReportIds(): string[] {
  return useSyncExternalStore(
    savedReportsStore.subscribe,
    savedReportsStore.getRecentIds,
    savedReportsStore.getRecentIds,
  );
}