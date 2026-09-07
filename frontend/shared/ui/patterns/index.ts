// frontend/shared/ui/patterns/index.ts
//
// Product-level composed components — the layer above `primitives/` (thin
// Base UI wrappers) and below `frontend/modules/*` (feature code).
//
// This is the barrel to import from. Unlike `frontend/shared/ui/index.ts`,
// which re-exports seven sub-barrels and has zero importers anywhere in the
// repo, everything here is intended to be pulled through this path:
//
//   import { MetricCard, DataState, StatusBadge } from '@/frontend/shared/ui/patterns';

export { MetricCard, MetricCardGrid, type MetricCardProps, type MetricDelta } from './MetricCard';
export { ErrorState, type ErrorStateVariant } from './ErrorState';
export { DataState, describeQueryError, isPermissionError } from './DataState';
export { SectionHeader, SectionPanel } from './SectionHeader';
export { StatusBadge, SeverityBadge, FleetStatusBadge, StatusDot } from './StatusBadge';
export {
  TONE_CLASSES,
  SEVERITY_TONE,
  SEVERITY_LABEL,
  FLEET_STATUS_TONE,
  FLEET_STATUS_LABEL,
  deltaTone,
  type Tone,
  type SeverityLevel,
  type FleetStatus,
} from './tone';
