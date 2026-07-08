
// frontend/shared/dashboards/WidgetRegistry.ts

import type { ComponentType } from 'react';
import { KPIsWidget } from './widgets/KPIsWidget';
import { FleetStatusWidget } from './widgets/FleetStatusWidget';
import { MaintenanceWidget } from './widgets/MaintenanceWidget';
import { FuelWidget } from './widgets/FuelWidget';
import { ExpensesWidget } from './widgets/ExpensesWidget';
import { TripsWidget } from './widgets/TripsWidget';
import { AlertsWidget } from './widgets/AlertsWidget';
import { AIRecommendationsWidget } from './widgets/AIRecommendationsWidget';
import { MapsWidget } from './widgets/MapsWidget';

export type WidgetKey =
  | 'kpis'
  | 'fleetStatus'
  | 'maintenance'
  | 'fuel'
  | 'expenses'
  | 'trips'
  | 'alerts'
  | 'aiRecommendations'
  | 'map';

export type WidgetSize = 'sm' | 'md' | 'lg' | 'full';

export interface WidgetDefinition {
  key: WidgetKey;
  title: string;
  description: string;
  size: WidgetSize;
  component: ComponentType;
  roles?: string[];
}

export const WIDGET_REGISTRY: Record<WidgetKey, WidgetDefinition> = {
  kpis: {
    key: 'kpis',
    title: 'Fleet KPIs',
    description: 'Headline fleet, maintenance, expense, and fuel numbers.',
    size: 'full',
    component: KPIsWidget,
  },
  fleetStatus: {
    key: 'fleetStatus',
    title: 'Fleet status',
    description: 'Active, maintenance, and inactive vehicle breakdown.',
    size: 'md',
    component: FleetStatusWidget,
  },
  aiRecommendations: {
    key: 'aiRecommendations',
    title: 'AI insights',
    description: 'Fleet health score, risk flags, and recommendations.',
    size: 'lg',
    component: AIRecommendationsWidget,
    roles: ['organization_owner', 'fleet_manager', 'auditor'],
  },
  maintenance: {
    key: 'maintenance',
    title: 'Upcoming maintenance',
    description: 'Overdue and upcoming service reminders.',
    size: 'md',
    component: MaintenanceWidget,
  },
  fuel: {
    key: 'fuel',
    title: 'Fuel trends',
    description: 'Monthly fuel volume and cost trend.',
    size: 'md',
    component: FuelWidget,
  },
  expenses: {
    key: 'expenses',
    title: 'Expense breakdown',
    description: 'Spending by category.',
    size: 'md',
    component: ExpensesWidget,
  },
  trips: {
    key: 'trips',
    title: 'Recent trips',
    description: 'Latest logged trips and total distance.',
    size: 'md',
    component: TripsWidget,
  },
  alerts: {
    key: 'alerts',
    title: 'Recent activity',
    description: 'Recent notifications across the organization.',
    size: 'md',
    component: AlertsWidget,
  },
  map: {
    key: 'map',
    title: 'Live fleet map',
    description: 'Fleet location preview.',
    size: 'md',
    component: MapsWidget,
  },
};

export const WIDGET_ORDER: WidgetKey[] = [
  'kpis',
  'fleetStatus',
  'aiRecommendations',
  'maintenance',
  'fuel',
  'expenses',
  'trips',
  'alerts',
  'map',
];