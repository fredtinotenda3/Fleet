// frontend/shared/dashboards/WidgetRegistry.ts

import type { ComponentType } from 'react';
import { Permission } from '@/server/permissions/roles';
import { KPIsWidget } from './widgets/KPIsWidget';
import { FleetStatusWidget } from './widgets/FleetStatusWidget';
import { MaintenanceWidget } from './widgets/MaintenanceWidget';
import { FuelWidget } from './widgets/FuelWidget';
import { ExpensesWidget } from './widgets/ExpensesWidget';
import { TripsWidget } from './widgets/TripsWidget';
import { AlertsWidget } from './widgets/AlertsWidget';
import { AIRecommendationsWidget } from './widgets/AIRecommendationsWidget';
import { NeedsAttentionWidget } from './widgets/NeedsAttentionWidget';
import { MapsWidget } from './widgets/MapsWidget';
import { CostPerKmWidget } from './widgets/CostPerKmWidget';

export type WidgetKey =
  | 'kpis'
  | 'fleetStatus'
  | 'needsAttention'
  | 'maintenance'
  | 'fuel'
  | 'expenses'
  | 'trips'
  | 'alerts'
  | 'aiRecommendations'
  | 'costPerKm'
  | 'map';

export type WidgetSize = 'sm' | 'md' | 'lg' | 'full';

export interface WidgetDefinition {
  key: WidgetKey;
  title: string;
  description: string;
  size: WidgetSize;
  component: ComponentType;
  /**
   * FIX (Phase E, objective 3+6): was `roles?: string[]`, matched via
   * raw string comparison. Only `aiRecommendations` was ever gated
   * (`['organization_owner', 'fleet_manager', 'auditor']`), which
   * excluded BRANCH_MANAGER/DEPARTMENT_MANAGER/WORKSHOP_MANAGER despite
   * all three holding ANALYTICS_VIEW. Now every data widget is gated on
   * the Permission that already governs its underlying data (mirrors
   * the page-level permission for that domain, e.g. `fuel` uses
   * FUEL_VIEW same as the /fuel pages) resolved via
   * permissionService.hasAnyPermission. Combined with each role's
   * org-unit-scoped queries (TenantContextService, Phase A), this is
   * what makes one shared dashboard shell actually render differently
   * per role -- e.g. DRIVER holds neither FUEL_VIEW, EXPENSE_VIEW, nor
   * ANALYTICS_VIEW, so a driver's dashboard naturally reduces to
   * fleetStatus/maintenance/trips/map/alerts, without a bespoke
   * "driver dashboard" component.
   */
  permission?: Permission[];
}

export const WIDGET_REGISTRY: Record<WidgetKey, WidgetDefinition> = {
  kpis: {
    key: 'kpis',
    title: 'Fleet KPIs',
    description: 'Headline fleet, maintenance, expense, and fuel numbers.',
    size: 'full',
    component: KPIsWidget,
    permission: [Permission.ANALYTICS_VIEW],
  },
  fleetStatus: {
    key: 'fleetStatus',
    title: 'Fleet status',
    description: 'Active, maintenance, and inactive vehicle breakdown.',
    size: 'md',
    component: FleetStatusWidget,
    permission: [Permission.VEHICLE_VIEW],
  },
  aiRecommendations: {
    key: 'aiRecommendations',
    title: 'AI insights',
    description: 'Fleet health score, risk flags, and recommendations.',
    size: 'lg',
    component: AIRecommendationsWidget,
    permission: [Permission.ANALYTICS_VIEW],
  },
  needsAttention: {
    key: 'needsAttention',
    title: 'Needs attention',
    description: 'Unified, priority-ranked queue across AI insights, compliance, and maintenance.',
    size: 'lg',
    component: NeedsAttentionWidget,
    permission: [Permission.ANALYTICS_VIEW],
  },
  maintenance: {
    key: 'maintenance',
    title: 'Upcoming maintenance',
    description: 'Overdue and upcoming service reminders.',
    size: 'md',
    component: MaintenanceWidget,
    permission: [Permission.MAINTENANCE_VIEW],
  },
  fuel: {
    key: 'fuel',
    title: 'Fuel trends',
    description: 'Monthly fuel volume and cost trend.',
    size: 'md',
    component: FuelWidget,
    permission: [Permission.FUEL_VIEW],
  },
  expenses: {
    key: 'expenses',
    title: 'Expense breakdown',
    description: 'Spending by category.',
    size: 'md',
    component: ExpensesWidget,
    permission: [Permission.EXPENSE_VIEW],
  },
  trips: {
    key: 'trips',
    title: 'Recent trips',
    description: 'Latest logged trips and total distance.',
    size: 'md',
    component: TripsWidget,
    permission: [Permission.TRIP_VIEW, Permission.DRIVER_VIEW_TRIPS],
  },
  alerts: {
    key: 'alerts',
    title: 'Recent activity',
    description: 'Recent notifications across the organization.',
    size: 'md',
    component: AlertsWidget,
    // No permission: personal/self-service notification feed, same as
    // the rest of the notification read path (unchanged from Phase C).
  },
  costPerKm: {
    key: 'costPerKm',
    title: 'Cost per km',
    description: 'Sampled fleet-wide cost-per-km with month-over-month trend.',
    size: 'md',
    component: CostPerKmWidget,
    permission: [Permission.FINANCE_VIEW],
  },
  map: {
    key: 'map',
    title: 'Live fleet map',
    description: 'Fleet location preview.',
    size: 'md',
    component: MapsWidget,
    permission: [Permission.VEHICLE_VIEW],
  },
};

export const WIDGET_ORDER: WidgetKey[] = [
  'kpis',
  'fleetStatus',
  'needsAttention',
  'aiRecommendations',
  'costPerKm',
  'maintenance',
  'fuel',
  'expenses',
  'trips',
  'alerts',
  'map',
];