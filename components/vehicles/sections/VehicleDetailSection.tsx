"use client";

import { CostPerKmCard } from "./CostPerKmCard";
import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FuelLog, MeterLog, Expense, Vehicle, Reminder, Trip } from "@/types";
import { toast } from "sonner";
import {
  FuelIcon,
  GaugeIcon,
  CoinsIcon,
  Wrench,
  Calendar,
  Car,
  Route,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SVGAttributes } from "react";
import React from "react";
import { calculateCombinedDistance, formatDistance, calculateFuelEfficiencyWithCombinedDistance } from "@/lib/distance";
import TripLogSection from "./TripLogSection";

type VehicleDetailSectionProps = {
  vehicle: Vehicle;
};

const iconColors = {
  expense: {
    bg: "bg-red-100 dark:bg-red-900/20",
    text: "text-red-600 dark:text-red-400",
  },
  fuel: {
    bg: "bg-orange-100 dark:bg-orange-900/20",
    text: "text-orange-600 dark:text-orange-400",
  },
  distance: {
    bg: "bg-blue-100 dark:bg-blue-900/20",
    text: "text-blue-600 dark:text-blue-400",
  },
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
  trip: {
    bg: "bg-cyan-100 dark:bg-cyan-900/20",
    text: "text-cyan-600 dark:text-cyan-400",
  },
};

interface StatCardProps {
  loading: boolean;
  icon: React.ReactElement<SVGAttributes<SVGElement>>;
  title: string;
  value: React.ReactNode;
  description?: string;
  colorKey: keyof typeof iconColors;
  iconSize?: string;
}

interface DetailItemProps {
  label: string;
  children: React.ReactNode;
  loading?: boolean;
}

const safeJSON = async (res: Response) => (res.ok ? await res.json() : []);

export default function VehicleDetailSection({
  vehicle,
}: VehicleDetailSectionProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [meterLogs, setMeterLogs] = useState<MeterLog[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const userLocale =
    typeof navigator !== "undefined" ? navigator.language : "en-US";

  const totalExpenses = useMemo(
    () => expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [expenses]
  );

  const totalFuelVolume = useMemo(
    () =>
      fuelLogs.reduce((sum, log) => sum + (Number(log.fuel_volume) || 0), 0),
    [fuelLogs]
  );

  // Combined distance from meter logs + manual trips
  const combinedDistance = useMemo(() => {
    return calculateCombinedDistance({
      meterLogs,
      trips,
      defaultUnitSymbol: "km",
    });
  }, [meterLogs, trips]);

  const serviceCount = useMemo(() => reminders.length, [reminders]);

  // Fuel efficiency using combined distance
  const fuelEfficiency = useMemo(() => {
    return calculateFuelEfficiencyWithCombinedDistance(fuelLogs, meterLogs, trips);
  }, [fuelLogs, meterLogs, trips]);

  const getSafeCurrency = useCallback((locale: string): string => {
    try {
      return (
        new Intl.NumberFormat(locale, { style: "currency" }).resolvedOptions()
          .currency || "USD"
      );
    } catch {
      return "USD";
    }
  }, []);

  const formatUnit = useCallback(
    (value: number, unit: string) => {
      try {
        return new Intl.NumberFormat(userLocale, {
          style: "unit",
          unit: unit === "km" ? "kilometer" : "liter",
          unitDisplay: "short",
        }).format(value);
      } catch {
        return `${value.toLocaleString()} ${unit}`;
      }
    },
    [userLocale]
  );

  const formattedExpenses = useMemo(
    () => (
      <span className="font-mono">
        {totalExpenses
          ? new Intl.NumberFormat(userLocale, {
              style: "currency",
              currency: getSafeCurrency(userLocale),
            }).format(totalExpenses)
          : "N/A"}
      </span>
    ),
    [totalExpenses, userLocale, getSafeCurrency]
  );

  const formattedFuelVolume = useMemo(
    () => (
      <span className="font-mono">
        {fuelLogs.length === 0
          ? "No fuel logs"
          : totalFuelVolume
          ? formatUnit(totalFuelVolume, "L")
          : "N/A"}
      </span>
    ),
    [fuelLogs.length, totalFuelVolume, formatUnit]
  );

  const formattedDistance = useMemo(
    () => (
      <span className="font-mono">
        {combinedDistance.hasData
          ? formatDistance(
              combinedDistance.totalDistance,
              combinedDistance.unitSymbol,
              { fallback: "N/A" }
            )
          : "No distance data"}
      </span>
    ),
    [combinedDistance]
  );

  const formattedDistanceDescription = useMemo(() => {
    if (!combinedDistance.hasData) return "Add meter logs or manual trips";
    const parts = [];
    if (combinedDistance.sources.meterLogs > 0) {
      parts.push(`${combinedDistance.sources.meterLogs.toLocaleString()} km from meter`);
    }
    if (combinedDistance.sources.trips > 0) {
      parts.push(`${combinedDistance.sources.trips.toLocaleString()} km from trips`);
    }
    return parts.join(" • ");
  }, [combinedDistance]);

  const formattedEfficiency = useMemo(
    () => (
      <span className="font-mono">
        {fuelEfficiency !== null ? `${fuelEfficiency.toFixed(2)} km/L` : "N/A"}
      </span>
    ),
    [fuelEfficiency]
  );

  const formattedPurchaseDate = useMemo(
    () => (
      <span className="font-mono">
        {vehicle.purchase_date
          ? new Intl.DateTimeFormat(userLocale).format(
              new Date(vehicle.purchase_date)
            )
          : "N/A"}
      </span>
    ),
    [vehicle.purchase_date, userLocale]
  );

  useEffect(() => {
    if (!vehicle.license_plate) return;

    const controller = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        const endpoints = [
          `/api/expenses?license_plate=${vehicle.license_plate}`,
          `/api/fuellogs?license_plate=${vehicle.license_plate}`,
          `/api/meterlogs?license_plate=${vehicle.license_plate}`,
          `/api/reminders?license_plate=${vehicle.license_plate}`,
          `/api/trips?license_plate=${vehicle.license_plate}`,
        ];

        const responses = await Promise.all(
          endpoints.map((url) => fetch(url, { signal: controller.signal }))
        );

        const results = await Promise.allSettled(
          responses.map((res) => safeJSON(res))
        );

        const [expensesData, fuelLogsData, meterLogsData, remindersData, tripsData] = results.map(
          (result) => (result.status === "fulfilled" ? result.value : [])
        );

        // Parse dates
        const parsedFuelLogs = fuelLogsData.map((log: FuelLog) => ({
          ...log,
          date: new Date(log.date),
        }));
        
        const parsedMeterLogs = meterLogsData.map((log: MeterLog) => ({
          ...log,
          date: new Date(log.date),
        }));
        
        const parsedTrips = tripsData.map((trip: Trip) => ({
          ...trip,
          date: new Date(trip.date),
        }));

        setExpenses(expensesData);
        setFuelLogs(parsedFuelLogs);
        setMeterLogs(parsedMeterLogs);
        setReminders(remindersData);
        setTrips(parsedTrips);
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          toast.error("Error loading vehicle data");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    return () => controller.abort();
  }, [vehicle.license_plate]);

  if (!vehicle?.license_plate) {
    return (
      <div className="p-4 text-muted-foreground text-center">
        Select a vehicle to view details
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className={cn("p-2 rounded-lg", iconColors.specifications.bg)}>
            <Car
              className={cn("h-6 w-6", iconColors.specifications.text)}
              aria-label="Vehicle specifications"
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {vehicle.make} {vehicle.model}
            </h1>
            <div className="flex items-center gap-2 text-muted-foreground mt-1">
              <Badge variant="secondary" className="text-sm font-mono">
                {vehicle.license_plate}
              </Badge>
              <span className="text-sm">•</span>
              <span className="text-sm">{vehicle.year}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          loading={loading}
          icon={<CoinsIcon className="h-5 w-5" />}
          title="Total Expenses"
          value={formattedExpenses}
          description="Includes all recorded expenses"
          colorKey="expense"
          iconSize="h-6 w-6"
        />
        <StatCard
          loading={loading}
          icon={<FuelIcon className="h-5 w-5" />}
          title="Fuel Volume"
          value={formattedFuelVolume}
          description={
            fuelLogs.length ? "Based on fuel logs" : "Start tracking fuel usage"
          }
          colorKey="fuel"
        />
        <StatCard
          loading={loading}
          icon={<GaugeIcon className="h-5 w-5" />}
          title="Total Distance"
          value={formattedDistance}
          description={formattedDistanceDescription}
          colorKey="distance"
        />
        <StatCard
          loading={loading}
          icon={<Wrench className="h-5 w-5" />}
          title="Services"
          value={
            <span className="font-mono">{serviceCount.toLocaleString()}</span>
          }
          description="Active service reminders"
          colorKey="service"
        />
        <CostPerKmCard
          expenses={expenses}
          fuelLogs={fuelLogs}
          meterLogs={meterLogs}
          trips={trips}
          loading={loading}
        />
        <StatCard
          loading={loading}
          icon={<Route className="h-5 w-5" />}
          title="Manual Trips"
          value={
            <span className="font-mono">{trips.length.toLocaleString()}</span>
          }
          description={
            trips.length
              ? `${trips.reduce((sum, t) => sum + t.distance_calculated, 0).toLocaleString()} km logged`
              : "No manual trips recorded"
          }
          colorKey="trip"
        />
        <StatCard
          loading={loading}
          icon={<GaugeIcon className="h-5 w-5" />}
          title="Fuel Efficiency"
          value={formattedEfficiency}
          description={
            fuelEfficiency ? "Distance per liter" : "Need fuel logs + distance data"
          }
          colorKey={
            fuelEfficiency
              ? fuelEfficiency < 5
                ? "expense"
                : fuelEfficiency >= 15
                ? "specifications"
                : "distance"
              : "distance"
          }
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-muted/50">
          <CardContent className="p-4 space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <div
                className={cn("p-2 rounded-lg", iconColors.specifications.bg)}
              >
                <Car
                  className={cn("h-5 w-5", iconColors.specifications.text)}
                />
              </div>
              Specifications
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <DetailItem label="Make" loading={loading}>
                {vehicle.make}
              </DetailItem>
              <DetailItem label="Model" loading={loading}>
                {vehicle.model}
              </DetailItem>
              <DetailItem label="Year" loading={loading}>
                {vehicle.year}
              </DetailItem>
              <DetailItem label="Fuel Type" loading={loading}>
                {vehicle.fuel_type}
              </DetailItem>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/50">
          <CardContent className="p-4 space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <div className={cn("p-2 rounded-lg", iconColors.info.bg)}>
                <Calendar className={cn("h-5 w-5", iconColors.info.text)} />
              </div>
              Additional Info
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <DetailItem label="Purchase Date" loading={loading}>
                {formattedPurchaseDate}
              </DetailItem>
              <DetailItem label="VIN Number" loading={loading}>
                <span className="font-mono">{vehicle.vin || "N/A"}</span>
              </DetailItem>
              <DetailItem label="Status" loading={loading}>
                <Badge
                  variant={
                    vehicle.status === "active"
                      ? "default"
                      : vehicle.status === "inactive"
                      ? "secondary"
                      : "destructive"
                  }
                  className="capitalize"
                >
                  {vehicle.status || "active"}
                </Badge>
              </DetailItem>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trip Log Section */}
      <div className="mt-6">
        <TripLogSection vehicle={vehicle} />
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
  <article className="hover:shadow-md transition-shadow" aria-busy={loading}>
    <CardContent className="p-4 flex items-center gap-4">
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
            <Skeleton className="h-4 w-48" />
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
    </CardContent>
  </article>
);

const DetailItem = ({ label, children, loading }: DetailItemProps) => (
  <div className="space-y-1">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    {loading ? (
      <Skeleton className="h-4 w-[80%]" />
    ) : (
      <dd className="text-sm font-medium">{children}</dd>
    )}
  </div>
);