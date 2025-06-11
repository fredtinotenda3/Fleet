"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FuelLog, MeterLog, Expense, Vehicle, Reminder } from "@/types";
import { toast } from "sonner";
import {
  FuelIcon,
  GaugeIcon,
  CoinsIcon,
  Wrench,
  Calendar,
  Car,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SVGAttributes } from "react";
import React from "react";

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

  const totalMeterOdometer = useMemo(
    () => meterLogs.reduce((sum, log) => sum + (Number(log.odometer) || 0), 0),
    [meterLogs]
  );

  const serviceCount = useMemo(() => reminders.length, [reminders]);

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

  const calculateSimpleEfficiency = useCallback(
    () =>
      totalFuelVolume > 0
        ? Number((totalMeterOdometer / totalFuelVolume).toFixed(2))
        : null,
    [totalFuelVolume, totalMeterOdometer]
  );

  const fuelEfficiency = useMemo(() => {
    try {
      if (fuelLogs.length < 2) return calculateSimpleEfficiency();

      const sorted = [...fuelLogs].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      const first = sorted[0]?.odometer;
      const last = sorted[sorted.length - 1]?.odometer;
      if (!first || !last) return calculateSimpleEfficiency();

      const distance = last - first;
      const volume = sorted
        .slice(1)
        .reduce((sum, log) => sum + (Number(log.fuel_volume) || 0), 0);

      return volume > 0 ? Number((distance / volume).toFixed(2)) : null;
    } catch {
      return calculateSimpleEfficiency();
    }
  }, [fuelLogs, calculateSimpleEfficiency]);

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
        {totalMeterOdometer ? formatUnit(totalMeterOdometer, "km") : "N/A"}
      </span>
    ),
    [totalMeterOdometer, formatUnit]
  );

  const formattedEfficiency = useMemo(
    () => (
      <span className="font-mono">
        {fuelEfficiency !== null ? `${fuelEfficiency} km/L` : "N/A"}
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
        ];

        const responses = await Promise.all(
          endpoints.map((url) => fetch(url, { signal: controller.signal }))
        );

        const results = await Promise.allSettled(
          responses.map((res) => safeJSON(res))
        );

        const [expenses, fuelLogs, meterLogs, reminders] = results.map(
          (result) => (result.status === "fulfilled" ? result.value : [])
        );

        setExpenses(expenses);
        setFuelLogs(fuelLogs);
        setMeterLogs(meterLogs);
        setReminders(reminders);
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
          description="Calculated from meter logs"
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
        <StatCard
          loading={loading}
          icon={<GaugeIcon className="h-5 w-5" />}
          title="Fuel Efficiency"
          value={formattedEfficiency}
          description={
            fuelEfficiency ? "Distance per liter" : "No fuel data available"
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
