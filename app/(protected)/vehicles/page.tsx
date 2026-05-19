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
import TripLogSection from "@/components/vehicles/sections/TripLogSection";
import { Vehicle, PaginatedResponse, ApiFilter } from "@/types";
import { DeleteConfirmationDialog } from "@/components/vehicles/ui/DeleteConfirmationDialog";
import { FiltersAndSearchBar } from "@/components/vehicles/ui/FiltersAndSearchBar";
import { VehiclesTable } from "@/components/vehicles/tables/VehiclesTable";
import { useSearchParams } from "next/navigation";
import { ImportModal } from "@/components/vehicles/ImportModal";
import { ExportModal } from "@/components/vehicles/ExportModal";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportData, setExportData] = useState<any[]>([]);

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

const handleImport = async (records: any[]) => {
  console.log("🚀 IMPORT STARTED - Records to import:", records.length);
  
  let successCount = 0;
  let errorCount = 0;
  const createdVehicles = new Set<string>();
  const createdExpenseTypes = new Set<string>();
  const errors: string[] = [];

  // First, collect all unique vehicles that need to be created
  const uniqueVehicles = new Set<string>();
  for (const record of records) {
    if (record.vehiclePlate && record.vehiclePlate !== "UNKNOWN" && record.vehiclePlate !== "Unknown") {
      uniqueVehicles.add(record.vehiclePlate);
    }
  }
  // ALWAYS add UNKNOWN vehicle
  uniqueVehicles.add("UNKNOWN");
  
  // Collect all unique account types for expense categories
  const uniqueAccounts = new Set<string>();
  for (const record of records) {
    if (record.account && record.account !== "Motor Expenses") {
      uniqueAccounts.add(record.account);
    }
  }
  uniqueAccounts.add("Motor Expenses");
  uniqueAccounts.add("Fuel & Oil Distribution Cost");
  uniqueAccounts.add("Motor Vehicle- Parking Fees");
  uniqueAccounts.add("Tollgate_Weighbridge Fees");
  
  console.log("🚗 Unique vehicles to create:", Array.from(uniqueVehicles));
  console.log("📁 Unique expense types to create:", Array.from(uniqueAccounts));
  
  // Create ALL vehicles first (including UNKNOWN)
  for (const vehiclePlate of uniqueVehicles) {
    try {
      // Check if vehicle exists
      const checkRes = await fetch(`/api/vehicles?license_plate=${encodeURIComponent(vehiclePlate)}`);
      const vehiclesData = await checkRes.json();
      let vehicles = Array.isArray(vehiclesData) ? vehiclesData : vehiclesData.data || [];
      
      if (vehicles.length === 0) {
        const createRes = await fetch("/api/vehicles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            license_plate: vehiclePlate,
            make: vehiclePlate === "UNKNOWN" ? "Unknown" : "Unknown",
            model: vehiclePlate === "UNKNOWN" ? "Vehicle" : "Truck",
            year: new Date().getFullYear(),
            vehicle_type: vehiclePlate === "UNKNOWN" ? "Unknown" : "Commercial",
            purchase_date: new Date().toISOString().split("T")[0],
            fuel_type: "Diesel",
            status: "active",
          }),
        });
        
        if (createRes.ok) {
          createdVehicles.add(vehiclePlate);
          console.log(`✅ Created vehicle: ${vehiclePlate}`);
        } else {
          console.log(`❌ Failed to create vehicle: ${vehiclePlate}`);
        }
      } else {
        console.log(`✓ Vehicle already exists: ${vehiclePlate}`);
        createdVehicles.add(vehiclePlate);
      }
    } catch (err) {
      console.error(`Error creating vehicle ${vehiclePlate}:`, err);
    }
  }
  
  // Create expense types from unique accounts
  const expenseTypeMap = new Map<string, string>();
  
  for (const account of uniqueAccounts) {
    try {
      const checkRes = await fetch(`/api/expense-types`);
      const existingTypes = await checkRes.json();
      const existingType = existingTypes.find((et: any) => et.name === account);
      
      if (existingType) {
        expenseTypeMap.set(account, existingType._id);
        console.log(`✓ Expense type already exists: ${account}`);
      } else {
        const createRes = await fetch("/api/expense-types", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: account,
            category: getCategoryFromAccount(account),
            description: `Auto-created from import: ${account}`,
          }),
        });
        
        if (createRes.ok) {
          const newType = await createRes.json();
          expenseTypeMap.set(account, newType.insertedId);
          createdExpenseTypes.add(account);
          console.log(`✅ Created expense type: ${account}`);
        }
      }
    } catch (err) {
      console.error(`Error creating expense type ${account}:`, err);
    }
  }
  
  // Now create all expenses
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    
    try {
      let vehiclePlate = record.vehiclePlate;
      if (!vehiclePlate || vehiclePlate === "Unknown") {
        vehiclePlate = "UNKNOWN";
      }
      
      let dateStr = "";
      if (record.date instanceof Date) {
        dateStr = record.date.toISOString().split("T")[0];
      } else if (typeof record.date === 'string') {
        dateStr = record.date;
      } else {
        dateStr = new Date(record.date).toISOString().split("T")[0];
      }
      
      let description = "";
      if (record.items && record.items.length > 0) {
        description = record.items.slice(0, 3).join("; ");
        if (record.items.length > 3) {
          description += ` (+${record.items.length - 3} more)`;
        }
      } else {
        description = record.details || "Imported expense";
      }
      
      const accountName = record.account || "Motor Expenses";
      const expenseTypeId = expenseTypeMap.get(accountName);
      
      const expenseData: any = {
        license_plate: vehiclePlate,
        amount: record.totalAmount,
        date: dateStr,
        description: description.substring(0, 200),
        notes: `Imported: ${record.references?.join(", ") || record.reference || "No ref"}`,
      };
      
      if (expenseTypeId) {
        expenseData.expense_type_id = expenseTypeId;
      }
      
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(expenseData),
      });
      
      if (response.ok) {
        successCount++;
      } else {
        const result = await response.json();
        errorCount++;
        errors.push(`${vehiclePlate}: ${result.error || "Unknown error"}`);
      }
    } catch (err) {
      errorCount++;
      errors.push(`${record.vehiclePlate || "Unknown"}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }
  
  console.log(`\n📊 IMPORT SUMMARY:`);
  console.log(`   Vehicles created: ${createdVehicles.size}`);
  console.log(`   Expense types created: ${createdExpenseTypes.size}`);
  console.log(`   Expenses created: ${successCount}`);
  console.log(`   Expenses failed: ${errorCount}`);
  
  if (createdVehicles.size > 0) {
    toast.success(`Created ${createdVehicles.size} new vehicle(s): ${Array.from(createdVehicles).join(", ")}`);
  }
  
  if (createdExpenseTypes.size > 0) {
    toast.success(`Created ${createdExpenseTypes.size} new expense type(s)`);
  }
  
  if (errorCount > 0) {
    toast.error(`Import completed: ${successCount} expenses created, ${errorCount} failed`, {
      description: errors.slice(0, 3).join(", "),
      duration: 5000,
    });
  } else {
    toast.success(`Successfully created ${successCount} expense records`);
  }
  
  // Refresh data
  fetchVehicles();
  setSelectedVehicle(null);
};

function getCategoryFromAccount(account: string): string {
  const lowerAccount = account.toLowerCase();
  if (lowerAccount.includes('fuel') || lowerAccount.includes('oil')) {
    return 'Fuel & Oil';
  }
  if (lowerAccount.includes('motor expense')) {
    return 'Maintenance & Repairs';
  }
  if (lowerAccount.includes('parking')) {
    return 'Parking Fees';
  }
  if (lowerAccount.includes('toll') || lowerAccount.includes('weighbridge')) {
    return 'Toll Fees';
  }
  return 'Other';
}

// Helper function to map account to category
function getCategoryFromAccount(account: string): string {
  const lowerAccount = account.toLowerCase();
  if (lowerAccount.includes('fuel') || lowerAccount.includes('oil')) {
    return 'Fuel & Oil';
  }
  if (lowerAccount.includes('motor expense')) {
    return 'Maintenance & Repairs';
  }
  if (lowerAccount.includes('parking')) {
    return 'Parking Fees';
  }
  if (lowerAccount.includes('toll') || lowerAccount.includes('weighbridge')) {
    return 'Toll Fees';
  }
  return 'Other';
}
  const handleExport = async () => {
    // Fetch all vehicles for export
    const res = await fetch("/api/vehicles?limit=10000");
    const result = await res.json();
    const vehicles = result.data || result;
    
    const exportData = vehicles.map((vehicle: any) => ({
      "License Plate": vehicle.license_plate,
      "Make": vehicle.make,
      "Model": vehicle.model,
      "Year": vehicle.year,
      "Vehicle Type": vehicle.vehicle_type,
      "Fuel Type": vehicle.fuel_type,
      "Color": vehicle.color || "N/A",
      "Status": vehicle.status || "active",
      "Purchase Date": vehicle.purchase_date ? new Date(vehicle.purchase_date).toLocaleDateString() : "N/A",
    }));
    
    setExportData(exportData);
    setShowExportModal(true);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <DeleteConfirmationDialog
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        onConfirm={handleConfirmDelete}
        deleteLoading={deleteLoading}
      />

      <div className="flex justify-between items-center">
        <FiltersAndSearchBar
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          setFilters={setFilters}
          toggleFormOpen={toggleFormOpen}
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImportModal(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

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
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="vehicles">
            Vehicles ({data.pagination.total})
          </TabsTrigger>
          {selectedVehicle && (
            <>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="expenses">Expenses</TabsTrigger>
              <TabsTrigger value="logs">FuelLogs</TabsTrigger>
              <TabsTrigger value="meter">MeterLogs</TabsTrigger>
              <TabsTrigger value="trips">Trips</TabsTrigger>
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
            <TabsContent value="trips">
              <TripLogSection vehicle={selectedVehicle} />
            </TabsContent>
            <TabsContent value="maintenance">
              <MaintenanceSection vehicle={selectedVehicle} />
            </TabsContent>
          </>
        )}
      </Tabs>

      <ImportModal
        open={showImportModal}
        onOpenChange={setShowImportModal}
        onImport={handleImport}
      />

      <ExportModal
        open={showExportModal}
        onOpenChange={setShowExportModal}
        data={exportData}
        title="Vehicles"
      />
    </div>
  );
}