// shared/utils/distance.utils.ts

export const DISTANCE_CONFIG = {
  defaultUnit: 'km',
  units: {
    km: { symbol: 'km', factor: 1 },
    mi: { symbol: 'mi', factor: 1.60934 },
    m: { symbol: 'm', factor: 0.001 },
  },
} as const;

export function formatDistance(
  distance: number,
  unit: string = DISTANCE_CONFIG.defaultUnit,
  decimals: number = 1
): string {
  if (distance === 0) return `0 ${unit}`;
  const formatted = distance.toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  });
  return `${formatted} ${unit}`;
}

export function formatDistanceCompact(distance: number): string {
  if (distance >= 10_000) {
    return `${(distance / 1_000).toFixed(0)}k km`;
  }
  return formatDistance(distance);
}

export function calculateEfficiency(
  distance: number,
  fuelVolume: number
): number | null {
  if (fuelVolume <= 0 || distance <= 0) return null;
  return distance / fuelVolume;
}

export function formatEfficiency(efficiency: number | null): string {
  if (efficiency === null) return 'N/A';
  return `${efficiency.toFixed(2)} km/L`;
}

export function convertDistance(
  value: number,
  fromUnit: string,
  toUnit: string
): number {
  const fromFactor = DISTANCE_CONFIG.units[fromUnit as keyof typeof DISTANCE_CONFIG.units]?.factor || 1;
  const toFactor = DISTANCE_CONFIG.units[toUnit as keyof typeof DISTANCE_CONFIG.units]?.factor || 1;
  const inKm = value * fromFactor;
  return inKm / toFactor;
}

export function calculateTotalDistanceFromLogs(
  logs: Array<{ odometer: number; date: Date }>
): number {
  if (logs.length < 2) return 0;
  const sorted = [...logs].sort((a, b) => a.date.getTime() - b.date.getTime());
  const first = sorted[0].odometer;
  const last = sorted[sorted.length - 1].odometer;
  return Math.max(0, last - first);
}