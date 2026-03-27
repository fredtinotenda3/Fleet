"use client";

import { useMemo } from "react";
import { Expense, FuelLog, MeterLog, Trip } from "@/types";
import { TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateCombinedDistance } from "@/lib/distance";  // Removed formatDistance

interface CostPerKmProps {
  expenses: Expense[];
  fuelLogs: FuelLog[];
  meterLogs: MeterLog[];
  trips?: Trip[];  // NEW: optional trips prop
  loading: boolean;
}

type RatingType = "good" | "average" | "poor" | "neutral";

const iconColors: Record<RatingType, { bg: string; text: string }> = {
  good: { bg: "bg-green-100 dark:bg-green-900/20", text: "text-green-600 dark:text-green-400" },
  average: { bg: "bg-amber-100 dark:bg-amber-900/20", text: "text-amber-600 dark:text-amber-400" },
  poor: { bg: "bg-red-100 dark:bg-red-900/20", text: "text-red-600 dark:text-red-400" },
  neutral: { bg: "bg-blue-100 dark:bg-blue-900/20", text: "text-blue-600 dark:text-blue-400" },
};

export function CostPerKmCard({ expenses, fuelLogs, meterLogs, trips = [], loading }: CostPerKmProps) {
  const { costPerKm, totalDistance, totalCost, rating, distanceSource } = useMemo(() => {
    // Total cost = all expenses + all fuel costs
    const expenseTotal = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const fuelTotal = fuelLogs.reduce((sum, f) => sum + (Number(f.cost) || 0), 0);
    const totalCost = expenseTotal + fuelTotal;

    // Total distance using combined utility
    const combined = calculateCombinedDistance({
      meterLogs,
      trips,
      defaultUnitSymbol: "km",
    });

    const totalDistance = combined.totalDistance;
    const hasMeterData = combined.sources.meterLogCount > 0;
    const hasTripData = combined.sources.tripCount > 0;

    // Determine source description
    let distanceSource = "No distance data";
    if (hasMeterData && hasTripData) {
      distanceSource = "Meter logs + manual trips";
    } else if (hasMeterData) {
      distanceSource = "Meter logs only";
    } else if (hasTripData) {
      distanceSource = "Manual trips only";
    }

    if (!combined.hasData || totalDistance <= 0) {
      return { costPerKm: null, totalDistance: 0, totalCost, rating: "neutral" as RatingType, distanceSource };
    }

    const costPerKm = totalCost / totalDistance;

    // Simple rating thresholds (adjust to your fleet's context)
    const rating: RatingType =
      costPerKm < 0.5 ? "good"
      : costPerKm < 1.5 ? "average"
      : "poor";

    return { costPerKm, totalDistance, totalCost, rating, distanceSource };
  }, [expenses, fuelLogs, meterLogs, trips]);

  const color = iconColors[rating];

  // Format cost per km with appropriate decimal places
  const formattedCostPerKm = costPerKm !== null 
    ? costPerKm < 0.01 
      ? `$${costPerKm.toFixed(4)}/km`
      : `$${costPerKm.toFixed(3)}/km`
    : "N/A";

  return (
    <article className="hover:shadow-md transition-shadow" aria-busy={loading}>
      <div className="p-4 flex items-center gap-4 border rounded-lg">
        <div className={cn("p-2 rounded-lg", color.bg)}>
          <TrendingDown className={cn("h-5 w-5", color.text)} />
        </div>
        <div className="space-y-1 min-w-[120px]">
          <h3 className="text-sm text-muted-foreground">Cost per km</h3>
          {loading ? (
            <div className="h-6 w-24 bg-muted animate-pulse rounded" />
          ) : costPerKm !== null ? (
            <>
              <div className={cn("text-xl font-semibold font-mono", color.text)}>
                {formattedCostPerKm}
              </div>
              <p className="text-xs text-muted-foreground">
                ${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })} over{" "}
                {totalDistance.toLocaleString()} km
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Source: {distanceSource}
              </p>
            </>
          ) : (
            <>
              <div className="text-xl font-semibold text-muted-foreground">N/A</div>
              <p className="text-xs text-muted-foreground">
                {distanceSource === "No distance data" 
                  ? "Add meter logs or manual trips to calculate"
                  : "Need distance data to calculate"}
              </p>
            </>
          )}
        </div>
      </div>
    </article>
  );
}