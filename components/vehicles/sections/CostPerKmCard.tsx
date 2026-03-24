"use client";

import { useMemo } from "react";
import { Expense, FuelLog, MeterLog } from "@/types";
import { TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CostPerKmProps {
  expenses: Expense[];
  fuelLogs: FuelLog[];
  meterLogs: MeterLog[];
  loading: boolean;
}

type RatingType = "good" | "average" | "poor" | "neutral";

const iconColors: Record<RatingType, { bg: string; text: string }> = {
  good: { bg: "bg-green-100 dark:bg-green-900/20", text: "text-green-600 dark:text-green-400" },
  average: { bg: "bg-amber-100 dark:bg-amber-900/20", text: "text-amber-600 dark:text-amber-400" },
  poor: { bg: "bg-red-100 dark:bg-red-900/20", text: "text-red-600 dark:text-red-400" },
  neutral: { bg: "bg-blue-100 dark:bg-blue-900/20", text: "text-blue-600 dark:text-blue-400" },
};

export function CostPerKmCard({ expenses, fuelLogs, meterLogs, loading }: CostPerKmProps) {
  const { costPerKm, totalDistance, totalCost, rating } = useMemo(() => {
    // Total cost = all expenses + all fuel costs
    const expenseTotal = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const fuelTotal = fuelLogs.reduce((sum, f) => sum + (Number(f.cost) || 0), 0);
    const totalCost = expenseTotal + fuelTotal;

    // Total distance = max odometer - min odometer across all meter logs
    if (meterLogs.length < 2) {
      return { costPerKm: null, totalDistance: 0, totalCost, rating: "neutral" as RatingType };
    }

    const readings = meterLogs
      .map((log) => Number(log.odometer))
      .filter((r) => !isNaN(r));

    const totalDistance = Math.max(...readings) - Math.min(...readings);

    if (totalDistance <= 0) {
      return { costPerKm: null, totalDistance: 0, totalCost, rating: "neutral" as RatingType };
    }

    const costPerKm = totalCost / totalDistance;

    // Simple rating thresholds (adjust to your fleet's context)
    const rating: RatingType =
      costPerKm < 0.5 ? "good"
      : costPerKm < 1.5 ? "average"
      : "poor";

    return { costPerKm, totalDistance, totalCost, rating };
  }, [expenses, fuelLogs, meterLogs]);

  const color = iconColors[rating];

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
                ${costPerKm.toFixed(3)}/km
              </div>
              <p className="text-xs text-muted-foreground">
                ${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })} over{" "}
                {totalDistance.toLocaleString()} km
              </p>
            </>
          ) : (
            <>
              <div className="text-xl font-semibold text-muted-foreground">N/A</div>
              <p className="text-xs text-muted-foreground">
                Need 2+ meter logs to calculate
              </p>
            </>
          )}
        </div>
      </div>
    </article>
  );
}