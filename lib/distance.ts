// lib/distance.ts
import { MeterLog, Trip } from "@/types";

export interface CombinedDistanceResult {
  totalDistance: number;
  unitId: string | null;
  unitSymbol: string | null;
  hasData: boolean;
  lastUpdate: Date | null;
  sources: {
    meterLogs: number;
    trips: number;
    meterLogCount: number;
    tripCount: number;
  };
}

export interface CombinedDistanceInput {
  meterLogs: MeterLog[];
  trips: Trip[];
  defaultUnitSymbol?: string;
}

// Helper type for fuel logs with flexible date
interface FuelLogInput {
  date: Date | string;
  fuel_volume: number;
  odometer?: number;
}

/**
 * Calculate the total distance for a vehicle by combining:
 * - Meter logs (max odometer reading - min odometer reading)
 * - Manual trips (sum of all trip distances)
 */
export function calculateCombinedDistance({
  meterLogs,
  trips,
  defaultUnitSymbol = "km",
}: CombinedDistanceInput): CombinedDistanceResult {
  // Calculate distance from meter logs
  let meterLogDistance = 0;
  let meterLogCount = 0;
  let lastMeterDate: Date | null = null;

  if (meterLogs.length >= 2) {
    const readings = meterLogs
      .map((log) => log.odometer)
      .filter((r) => !isNaN(r) && r !== undefined && r !== null);

    if (readings.length >= 2) {
      const maxReading = Math.max(...readings);
      const minReading = Math.min(...readings);
      meterLogDistance = maxReading - minReading;
      meterLogCount = meterLogs.length;

      // Get the latest meter log date
      const sortedByDate = [...meterLogs].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      if (sortedByDate.length > 0) {
        lastMeterDate = new Date(sortedByDate[0].date);
      }
    }
  } else if (meterLogs.length === 1) {
    // Single meter log gives 0 distance, but we count it as a source
    meterLogCount = 1;
    lastMeterDate = new Date(meterLogs[0].date);
  }

  // Calculate distance from manual trips
  let tripDistance = 0;
  let lastTripDate: Date | null = null;

  if (trips.length > 0) {
    tripDistance = trips.reduce(
      (sum, trip) => sum + (trip.distance_calculated || 0),
      0
    );

    // Get the latest trip date
    const sortedTrips = [...trips].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    if (sortedTrips.length > 0) {
      lastTripDate = new Date(sortedTrips[0].date);
    }
  }

  // Get the latest update date
  let lastUpdate: Date | null = null;
  if (lastMeterDate && lastTripDate) {
    lastUpdate = lastMeterDate > lastTripDate ? lastMeterDate : lastTripDate;
  } else if (lastMeterDate) {
    lastUpdate = lastMeterDate;
  } else if (lastTripDate) {
    lastUpdate = lastTripDate;
  }

  // Get unit info (prefer meter log unit, fallback to trip unit, then default)
  let unitId: string | null = null;
  const unitSymbol: string | null = defaultUnitSymbol;  // FIXED: changed from 'let' to 'const'

  if (meterLogs.length > 0 && meterLogs[0].unit_id) {
    unitId = meterLogs[0].unit_id;
  } else if (trips.length > 0 && trips[0].unit_id) {
    unitId = trips[0].unit_id;
  }

  const totalDistance = meterLogDistance + tripDistance;
  const hasData = meterLogCount > 0 || trips.length > 0;

  return {
    totalDistance,
    unitId,
    unitSymbol,
    hasData,
    lastUpdate,
    sources: {
      meterLogs: meterLogDistance,
      trips: tripDistance,
      meterLogCount,
      tripCount: trips.length,
    },
  };
}

/**
 * Get the last known odometer reading from combined sources
 * Useful for starting point when logging new trips
 */
export function getLastOdometerReading(
  meterLogs: MeterLog[],
  trips: Trip[],
  initialOdometer?: number
): number | null {
  // Sort all distance events by date
  const events: Array<{ date: Date; value: number; type: string }> = [];

  // Add meter logs
  meterLogs.forEach((log) => {
    events.push({
      date: new Date(log.date),
      value: log.odometer,
      type: "meter",
    });
  });

  // Add trips (cumulative)
  const sortedTrips = [...trips].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  let cumulativeDistance = 0;
  sortedTrips.forEach((trip) => {
    cumulativeDistance += trip.distance_calculated;
    events.push({
      date: new Date(trip.date),
      value: cumulativeDistance,
      type: "trip_cumulative",
    });
  });

  if (events.length === 0) {
    return initialOdometer || null;
  }

  // Get the most recent event
  const sortedEvents = events.sort(
    (a, b) => b.date.getTime() - a.date.getTime()
  );

  const latest = sortedEvents[0];

  // If latest is a meter log, return its value
  if (latest.type === "meter") {
    return latest.value;
  }

  // If latest is a cumulative trip, we need to add any meter logs that might be after?
  // Actually, trips are independent - we can't combine them for a single "odometer"
  // So we return null for combined odometer (use separate sources)
  return null;
}

/**
 * Format distance for display with proper unit
 */
export function formatDistance(
  distance: number,
  unitSymbol: string | null,
  options: { fallback?: string; decimals?: number } = {}
): string {
  const { fallback = "N/A", decimals = 0 } = options;

  if (!distance || distance === 0) {
    return fallback;
  }

  const formatted = distance.toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  });

  return unitSymbol ? `${formatted} ${unitSymbol}` : formatted;
}

/**
 * Get distance since a specific date
 * Useful for calculating distance since last service
 */
export function getDistanceSinceDate(
  meterLogs: MeterLog[],
  trips: Trip[],
  sinceDate: Date
): number {
  // Get meter logs after the date
  const meterDistance = getMeterLogDistanceSinceDate(meterLogs, sinceDate);

  // Get trips after the date
  const tripDistance = trips
    .filter((trip) => new Date(trip.date) >= sinceDate)
    .reduce((sum, trip) => sum + (trip.distance_calculated || 0), 0);

  return meterDistance + tripDistance;
}

/**
 * Helper: Calculate meter log distance since a specific date
 * Uses cumulative distance from earliest reading after date to latest
 */
function getMeterLogDistanceSinceDate(
  meterLogs: MeterLog[],
  sinceDate: Date
): number {
  const logsAfterDate = meterLogs.filter(
    (log) => new Date(log.date) >= sinceDate
  );

  if (logsAfterDate.length < 2) {
    return 0;
  }

  const readings = logsAfterDate.map((log) => log.odometer);
  const maxReading = Math.max(...readings);
  const minReading = Math.min(...readings);

  return maxReading - minReading;
}

/**
 * Calculate fuel efficiency using combined distance
 * Accepts fuel logs with Date | string for date field
 */
export function calculateFuelEfficiencyWithCombinedDistance(
  fuelLogs: FuelLogInput[],
  meterLogs: MeterLog[],
  trips: Trip[]
): number | null {
  // Sort fuel logs by date
  const sortedFuelLogs = [...fuelLogs].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  if (sortedFuelLogs.length < 2) {
    return null;
  }

  // Get distance between first and last fuel log
  const firstDate = new Date(sortedFuelLogs[0].date);
  const lastDate = new Date(sortedFuelLogs[sortedFuelLogs.length - 1].date);

  // If we have odometer readings on fuel logs, use those
  const firstOdometer = sortedFuelLogs[0].odometer;
  const lastOdometer = sortedFuelLogs[sortedFuelLogs.length - 1].odometer;

  if (firstOdometer && lastOdometer && firstOdometer > 0 && lastOdometer > 0) {
    const distance = lastOdometer - firstOdometer;
    const totalFuel = sortedFuelLogs.reduce(
      (sum, log) => sum + (log.fuel_volume || 0),
      0
    );
    return totalFuel > 0 ? distance / totalFuel : null;
  }

  // Fallback to combined distance from meter logs + trips
  const logsBetweenDates = meterLogs.filter(
    (log) => new Date(log.date) >= firstDate && new Date(log.date) <= lastDate
  );

  const tripsBetweenDates = trips.filter(
    (trip) => new Date(trip.date) >= firstDate && new Date(trip.date) <= lastDate
  );

  const combinedDistance = calculateCombinedDistance({
    meterLogs: logsBetweenDates,
    trips: tripsBetweenDates,
  });

  const totalFuel = sortedFuelLogs.reduce(
    (sum, log) => sum + (log.fuel_volume || 0),
    0
  );

  if (combinedDistance.totalDistance > 0 && totalFuel > 0) {
    return combinedDistance.totalDistance / totalFuel;
  }

  return null;
}