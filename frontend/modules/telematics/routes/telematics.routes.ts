// frontend/modules/telematics/routes/telematics.routes.ts

export const TELEMATICS_ROUTES = {
  liveMap: '/telematics/map',
  /** Admin screen for linking unmatched Eagle Track trackers to vehicles. */
  trackerMapping: '/telematics/trackers',
} as const;
