"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import DashboardHeader from "@/components/dashboard/DashboardHeader";
import FleetVehiclesDetailsSummary from "@/components/dashboard/FleetVehiclesDetailsSummary";
import FleetExpenseSummary from "@/components/dashboard/FleetExpenseSummary";
import FleetFuelSummary from "@/components/dashboard/FleetFuelSummary";
// import FleetDistanceSummary from "@/components/dashboard/FleetDistanceSummary";
import FleetMaintenanceSummary from "@/components/dashboard/FleetMaintenanceSummary";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex justify-center pt-10">
        <p className="text-gray-600 text-lg animate-pulse">
          Loading dashboard...
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <main className="flex-1 bg-gray-100 p-0.5 ">
        <DashboardHeader name={session?.user?.name} />
        <FleetVehiclesDetailsSummary />
        <FleetExpenseSummary />
        <FleetFuelSummary />
        {/* <FleetDistanceSummary /> */}
        <FleetMaintenanceSummary />
      </main>
    </div>
  );
}
