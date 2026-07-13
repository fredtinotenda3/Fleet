// frontend/modules/reports/utils/widgetMappers.ts
//
// Bridges reporting's DashboardData payload (from dashboardsApi.render) onto
// the shared widget system already implemented at frontend/shared/dashboards
// (WidgetRegistry, DashboardGrid, DashboardWidget, and the concrete widgets:
// AIRecommendationsWidget, AlertsWidget, ExpensesWidget, FleetStatusWidget,
// FuelWidget, KPIsWidget, MaintenanceWidget, MapsWidget, TripsWidget).
//
// The reporting backend describes a dashboard as a list of widget instances
// (id, type, position, config, data). This module normalizes that into the
// prop shape DashboardGrid/DashboardWidget expect, and resolves each
// widget's `type` to the matching entry already registered in
// WidgetRegistry.ts, so the Executive Dashboard renders through the exact
// same widget components as any custom dashboard built with DashboardBuilder.

import type { DashboardData } from '../types';

/** Widget type identifiers understood by WidgetRegistry.ts. */
export const WIDGET_TYPE_MAP = {
  kpis: 'kpis',
  fleetStatus: 'fleet-status',
  fuel: 'fuel',
  maintenance: 'maintenance',
  expenses: 'expenses',
  trips: 'trips',
  alerts: 'alerts',
  aiRecommendations: 'ai-recommendations',
  maps: 'maps',
} as const;

export type RegisteredWidgetType = (typeof WIDGET_TYPE_MAP)[keyof typeof WIDGET_TYPE_MAP];

export interface NormalizedWidgetInstance {
  id: string;
  type: RegisteredWidgetType | string;
  title: string;
  gridPosition: { x: number; y: number; w: number; h: number };
  data: unknown;
  isLoading: boolean;
  error: string | null;
}

interface RawWidgetEntry {
  id?: string;
  widgetId?: string;
  type?: string;
  widgetType?: string;
  title?: string;
  name?: string;
  position?: { x?: number; y?: number; w?: number; h?: number };
  layout?: { x?: number; y?: number; w?: number; h?: number };
  data?: unknown;
  payload?: unknown;
  error?: string | null;
}

/**
 * Normalizes an unknown widget type string coming from the backend registry
 * to the canonical kebab-case identifiers WidgetRegistry.ts uses. Falls back
 * to the raw string (rather than throwing) so a newly added backend widget
 * type doesn't crash the whole dashboard - DashboardWidget already renders
 * an "unsupported widget" fallback for unknown types.
 */
export function resolveWidgetType(rawType: string | undefined): string {
  if (!rawType) return 'unknown';
  const key = rawType.replace(/[-_\s]/g, '').toLowerCase();
  const match = Object.entries(WIDGET_TYPE_MAP).find(
    ([mapKey]) => mapKey.toLowerCase() === key,
  );
  return match ? match[1] : rawType;
}

function coercePosition(entry: RawWidgetEntry, index: number): NormalizedWidgetInstance['gridPosition'] {
  const pos = entry.position ?? entry.layout;
  return {
    x: pos?.x ?? (index % 4) * 3,
    y: pos?.y ?? Math.floor(index / 4) * 3,
    w: pos?.w ?? 3,
    h: pos?.h ?? 3,
  };
}

/**
 * Converts the raw `DashboardData` payload into the widget list DashboardGrid
 * consumes. Accepts either `widgets` or `items` as the collection key since
 * dashboard.service.ts and drilldown.service.ts have historically used both
 * names across the reporting module's evolution - this keeps the mapper
 * resilient to either without requiring a backend change.
 */
export function mapDashboardDataToWidgets(
  dashboardData: DashboardData | null | undefined,
): NormalizedWidgetInstance[] {
  if (!dashboardData) return [];

  const rawWidgets: RawWidgetEntry[] =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (dashboardData as any).widgets ?? (dashboardData as any).items ?? [];

  return rawWidgets.map((entry, index) => {
    const rawType = entry.type ?? entry.widgetType ?? 'unknown';
    return {
      id: entry.id ?? entry.widgetId ?? `widget-${index}`,
      type: resolveWidgetType(rawType),
      title: entry.title ?? entry.name ?? humanizeWidgetType(rawType),
      gridPosition: coercePosition(entry, index),
      data: entry.data ?? entry.payload ?? null,
      isLoading: false,
      error: entry.error ?? null,
    };
  });
}

function humanizeWidgetType(type: string): string {
  return type
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}