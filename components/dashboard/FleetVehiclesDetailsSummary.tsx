/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/dashboard/FleetSummaryCard.tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Wrench, Car } from "lucide-react";
import { cn } from "@/lib/utils";
import React from "react";

interface FleetSummary {
  totalVehicles: number;
  activeVehicles: number;
  maintenanceVehicles: number;
}

interface StatCardProps {
  icon: React.ReactElement<any>; // <- fixed
  title: string;
  value: React.ReactNode;
  description?: string;
  colorKey: "service" | "specifications" | "info";
  loading?: boolean;
  iconSize?: string;
}

const iconColors = {
  service: {
    bg: "bg-yellow-100 dark:bg-yellow-900/20",
    text: "text-yellow-600 dark:text-yellow-400",
  },
  specifications: {
    bg: "bg-green-100 dark:bg-green-900/20",
    text: "text-green-600 dark:text-green-400",
  },
  info: {
    bg: "bg-purple-100 dark:bg-purple-900/20",
    text: "text-purple-600 dark:text-purple-400",
  },
};

export default function FleetVehiclesDetailsSummary() {
  const [summary, setSummary] = useState<FleetSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);

        const res = await fetch("/api/vehicles?limit=0", {
          signal: abortController.signal,
        });

        if (!res.ok) throw new Error("Failed to fetch vehicles");

        const response = await res.json();
        const vehicles = response.data || [];

        const activeVehicles = vehicles.filter(
          (v: any) => v.status === "active"
        ).length;

        const maintenanceVehicles = vehicles.filter(
          (v: any) => v.status === "maintenance"
        ).length;

        setSummary({
          totalVehicles: response.pagination?.total || 0,
          activeVehicles,
          maintenanceVehicles,
        });
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          toast.error("Error loading fleet summary");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    return () => abortController.abort();
  }, []);

  return (
    <div className="bg-muted/50 rounded-xl p-4">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Car className="h-5 w-5 text-blue-600" />
        StanleyVerse Fleet Vehicles Details Summary
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          loading={loading}
          icon={<Car className="h-5 w-5" />}
          title="Total Vehicles"
          value={summary?.totalVehicles.toLocaleString() || "0"}
          colorKey="specifications"
        />

        <StatCard
          loading={loading}
          icon={<Car className="h-5 w-5" />}
          title="Active Vehicles"
          value={summary?.activeVehicles.toLocaleString() || "0"}
          description="Currently in operation"
          colorKey="specifications"
        />

        <StatCard
          loading={loading}
          icon={<Wrench className="h-5 w-5" />}
          title="In Maintenance"
          value={summary?.maintenanceVehicles.toLocaleString() || "0"}
          description="Undergoing service"
          colorKey="service"
        />
      </div>
    </div>
  );
}

const StatCard = ({
  loading,
  icon,
  title,
  value,
  description,
  colorKey,
  iconSize = "h-5 w-5",
}: StatCardProps) => (
  <article
    className="bg-background rounded-lg border hover:shadow-md transition-shadow"
    aria-busy={loading}
  >
    <div className="p-4 flex items-center gap-4">
      <div className={cn("p-2 rounded-lg", iconColors[colorKey].bg)}>
        {React.cloneElement(icon, {
          className: cn(iconSize, iconColors[colorKey].text),
        })}
      </div>
      <div className="space-y-1 min-w-[120px]">
        <h3 className="text-sm text-muted-foreground">{title}</h3>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            {description && <Skeleton className="h-4 w-48" />}
          </div>
        ) : (
          <>
            <div className="text-xl font-semibold">{value}</div>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </>
        )}
      </div>
    </div>
  </article>
);
