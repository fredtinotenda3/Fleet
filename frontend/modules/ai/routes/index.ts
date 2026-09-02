// frontend/modules/ai/routes/index.ts

export const AI_ROUTES = {
  /** Picker view -- pick a driver, then navigate to driverScorecard(driverId). */
  driverScorecardPicker: '/drivers/scorecard',
  driverScorecard: (driverId: string) => `/drivers/${driverId}/scorecard`,
} as const;

