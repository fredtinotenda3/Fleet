// frontend/modules/telematics/hooks/index.ts

export { useLiveMap, useVehicleRouteHistory, useVehicleDetail, telematicsKeys } from './useLiveMap';
export { useDemoStatus, useSetDemoMode } from './useDemoMode';
export { useCartrackConfig } from './useCartrackConfig';
export { useEagleTrackConfig } from './useEagleTrackConfig';
export {
  useEagleTrackHistory,
  useEagleTrackFuelReport,
  useEagleTrackTriggers,
  useEagleTrackTrackerMapping,
  useCreateTrackerLink,
  useDeleteTrackerLink,
  hourlyWindow,
  eagletrackKeys,
} from './useEagleTrack';
