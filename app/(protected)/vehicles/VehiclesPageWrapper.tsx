"use client";

import { Suspense } from "react";
import VehiclePage from "./page";

export default function VehiclesPageWrapper() {
  return (
    <Suspense fallback={<>Loading vehicle data...</>}>
      <VehiclePage />
    </Suspense>
  );
}
