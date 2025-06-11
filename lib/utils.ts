import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
// lib/units.ts
import { Unit } from "@/types";

// Conversion factors to base units (km for distance, L for volume)
const CONVERSION_FACTORS: Record<string, number> = {
  // Distance units (to km)
  km: 1,
  m: 0.001,
  mi: 1.60934,
  mile: 1.60934,

  // Volume units (to L)
  L: 1,
  l: 1,
  gal: 3.78541,
  gallon: 3.78541,

  // Currency units (to USD)
  usd: 1,
  $: 1,
  "€": 1.07,
  "£": 1.27,
};

export const convertToBaseUnit = (
  value: number,
  unit: Unit,
  targetType: "distance" | "volume" | "currency"
): number => {
  // If already in correct unit type and base unit, return as is
  if (unit.type === targetType && unit.symbol === getBaseSymbol(targetType)) {
    return value;
  }

  const conversionFactor = CONVERSION_FACTORS[unit.symbol.toLowerCase()] || 1;
  return value * conversionFactor;
};

export const getBaseSymbol = (
  type: "distance" | "volume" | "currency"
): string => {
  switch (type) {
    case "distance":
      return "km";
    case "volume":
      return "L";
    case "currency":
      return "$";
    default:
      return "";
  }
};

export const formatWithUnit = (
  value: number,
  unit: Unit | null,
  targetType: "distance" | "volume" | "currency"
): string => {
  if (!unit) return `${value.toFixed(2)}`;

  const baseValue = convertToBaseUnit(value, unit, targetType);
  const baseSymbol = getBaseSymbol(targetType);

  return `${baseValue.toFixed(2)} ${baseSymbol}`;
};

/**
 * Merges class names together with Tailwind CSS conflict resolution
 * @param inputs Class values to merge
 * @returns Optimized class string
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// lib/utils.ts
import { format } from "date-fns";
import { FuelLog } from "@/types";

export const formatDate = (date: Date | string, formatStr = "MMM dd, yyyy") => {
  return format(new Date(date), formatStr);
};

export const calculateEfficiency = (logs: FuelLog[]) => {
  const efficiencyMap = new Map<string, number>();
  const sortedLogs = [...logs].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  for (let i = 1; i < sortedLogs.length; i++) {
    const current = sortedLogs[i];
    const previous = sortedLogs[i - 1];
    const distance = current.odometer - previous.odometer;
    if (current.fuel_volume > 0) {
      const efficiency = distance / current.fuel_volume;
      efficiencyMap.set(current.date.toString(), Number(efficiency.toFixed(2)));
    }
  }
  return efficiencyMap;
};
