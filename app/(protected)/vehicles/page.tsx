/* eslint-disable react-hooks/exhaustive-deps */
"use client";
import { useCallback, useEffect, useState } from "react";
import { useDebounce } from "use-debounce";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import VehicleForm from "@/components/vehicles/forms/VehicleForm";
import VehicleDetailSection from "@/components/vehicles/sections/VehicleDetailSection";
import ExpenseSection from "@/components/vehicles/sections/ExpenseSection";
import MaintenanceSection from "@/components/vehicles/sections/MaintenanceSection";
import FuelLogSection from "@/components/vehicles/sections/FuelLogSection";
import MeterLogSection from "@/components/vehicles/sections/MeterLogSection";
import { Vehicle, PaginatedResponse, ApiFilter } from "@/types";
import { DeleteConfirmationDialog } from "@/components/vehicles/ui/DeleteConfirmationDialog";
import { FiltersAndSearchBar } from "@/components/vehicles/ui/FiltersAndSearchBar";
import { VehiclesTable } from "@/components/vehicles/tables/VehiclesTable";
import { useSearchParams } from "next/navigation";

// Type guard helpers
function isErrorWithMessage(error: unknown): error is { message: string } {
  return typeof error === "object" && error !== null && "message" in error;
}

function isAbortError(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function VehiclePage() {
  const searchParams = useSearchParams();
  const licensePlateFromUrl = searchParams.get("selectedVehicle");
  const [data, setData] = useState<PaginatedResponse<Vehicle>>({
    data: [],
    pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
  });
  const [filters, setFilters] = useState<ApiFilter>({});
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch] = useDebounce(searchTerm, 500);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("vehicles");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [vehicleToDelete, setVehicleToDelete] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [loadingTable, setLoadingTable] = useState(false);

  // Set license plate filter from URL param
  useEffect(() => {
    if (licensePlateFromUrl) {
      setFilters((prev) => ({ ...prev, license_plate: licensePlateFromUrl }));
    }
  }, [licensePlateFromUrl]);

  // Auto-select vehicle when filtered data loads
  useEffect(() => {
    if (licensePlateFromUrl && data.data.length === 1) {
      setSelectedVehicle(data.data[0]);
      setActiveTab("details");
    }
  }, [data.data, licensePlateFromUrl]);

  useEffect(() => {
    if (!selectedVehicle && activeTab !== "vehicles") {
      setActiveTab("vehicles");
    }
  }, [selectedVehicle, activeTab]);

  const fetchVehicles = useCallback(
    async (signal?: AbortSignal) => {
      setLoadingTable(true);
      try {
        const params = new URLSearchParams({
          page: data.pagination.page.toString(),
          limit: data.pagination.limit.toString(),
        });

        if (debouncedSearch) {
          params.set("license_plate", debouncedSearch);
        }

        Object.entries(filters).forEach(([key, value]) => {
          if (key === "page" || key === "limit") return;
          if (Array.isArray(value)) {
            value.forEach((v) => params.append(key, v));
          } else if (value !== undefined && value !== null) {
            params.set(key, String(value));
          }
        });

        const res = await fetch(`/api/vehicles?${params}`, { signal });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.message || "Failed to fetch vehicles");
        }

        const result: PaginatedResponse<Vehicle> = await res.json();

        setData({
          data: Array.isArray(result.data) ? result.data : [],
          pagination: result.pagination || {
            page: 1,
            limit: 10,
            total: 0,
            totalPages: 0,
          },
        });
      } catch (error) {
        if (!isAbortError(error)) {
          console.error("Fetch error:", error);
          toast.error(
            isErrorWithMessage(error)
              ? error.message
              : "Failed to fetch vehicles"
          );
        }
      } finally {
        setLoadingTable(false);
      }
    },
    [data.pagination.page, data.pagination.limit, filters, debouncedSearch]
  );

  useEffect(() => {
    const abortController = new AbortController();
    fetchVehicles(abortController.signal);
    return () => abortController.abort();
  }, [data.pagination.page, filters, debouncedSearch]);

  useEffect(() => {
    setData((prev) => ({
      ...prev,
      pagination: { ...prev.pagination, page: 1 },
    }));
  }, [filters, debouncedSearch]);

  const handlePageChange = useCallback((newPage: number) => {
    setData((prev) => ({
      ...prev,
      pagination: { ...prev.pagination, page: newPage },
    }));
  }, []);

  const toggleFormOpen = useCallback((open: boolean) => {
    if (!open) setSelectedVehicle(null);
    setIsFormOpen(open);
  }, []);

  const handleEdit = useCallback((vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setIsFormOpen(true);
  }, []);

  const handleDeleteClick = useCallback((id: string) => {
    setVehicleToDelete(id);
    setShowDeleteModal(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!vehicleToDelete) return;

    setDeleteLoading(true);
    try {
      await toast.promise(
        fetch("/api/vehicles", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: vehicleToDelete }),
        }).then(async (response) => {
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Failed to delete vehicle");
          }
          await fetchVehicles();

          if (selectedVehicle?._id === vehicleToDelete) {
            setSelectedVehicle(null);
          }
        }),
        {
          loading: "Deleting vehicle...",
          success: "Vehicle deleted successfully!",
          error: (error) =>
            isErrorWithMessage(error)
              ? error.message
              : "Failed to delete vehicle",
        }
      );
    } catch (error) {
      console.error("Delete error:", error);
      if (isErrorWithMessage(error)) {
        toast.error(error.message);
      }
    } finally {
      setDeleteLoading(false);
      setShowDeleteModal(false);
      setVehicleToDelete(null);
    }
  }, [vehicleToDelete, selectedVehicle, fetchVehicles]);

  const handleStatusChange = useCallback(
    async (vehicleId: string, newStatus: Vehicle["status"]) => {
      try {
        await toast.promise(
          fetch("/api/vehicles", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              _id: vehicleId,
              status: newStatus,
            }),
          }).then(async (response) => {
            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.message || "Failed to update status");
            }
            return response.json();
          }),
          {
            loading: "Updating status...",
            success: "Status updated successfully!",
            error: (error) =>
              isErrorWithMessage(error)
                ? error.message
                : "Failed to update status",
          }
        );

        await fetchVehicles();
      } catch (error) {
        console.error("Status update error:", error);
        if (isErrorWithMessage(error)) {
          toast.error(error.message);
        }
      }
    },
    [fetchVehicles]
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <DeleteConfirmationDialog
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        onConfirm={handleConfirmDelete}
        deleteLoading={deleteLoading}
      />

      <FiltersAndSearchBar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        setFilters={setFilters}
        toggleFormOpen={toggleFormOpen}
      />

      <Dialog open={isFormOpen} onOpenChange={toggleFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedVehicle ? "Edit Vehicle" : "Add Vehicle"}
            </DialogTitle>
          </DialogHeader>
          <VehicleForm
            refresh={fetchVehicles}
            closeModal={() => setIsFormOpen(false)}
            vehicle={selectedVehicle}
          />
        </DialogContent>
      </Dialog>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="vehicles">
            Vehicles ({data.pagination.total})
          </TabsTrigger>
          {selectedVehicle && (
            <>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="expenses">Expenses</TabsTrigger>
              <TabsTrigger value="logs">FuelLogs</TabsTrigger>
              <TabsTrigger value="meter">MeterLogs</TabsTrigger>
              <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="vehicles">
          <VehiclesTable
            data={data}
            loading={loadingTable}
            onPageChange={handlePageChange}
            onEdit={handleEdit}
            onDelete={handleDeleteClick}
            onStatusChange={handleStatusChange}
            onSelectVehicle={(vehicle) => {
              setSelectedVehicle(vehicle);
              setActiveTab("details");
            }}
          />
        </TabsContent>

        {selectedVehicle && (
          <>
            <TabsContent value="details">
              <VehicleDetailSection vehicle={selectedVehicle} />
            </TabsContent>
            <TabsContent value="expenses">
              <ExpenseSection vehicle={selectedVehicle} />
            </TabsContent>
            <TabsContent value="logs">
              <FuelLogSection vehicle={selectedVehicle} />
            </TabsContent>
            <TabsContent value="meter">
              <MeterLogSection vehicle={selectedVehicle} />
            </TabsContent>
            <TabsContent value="maintenance">
              <MaintenanceSection vehicle={selectedVehicle} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
