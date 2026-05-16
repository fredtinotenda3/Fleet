'use client';

import { useState, useCallback } from 'react';
import { useVehicles, useVehicleStats } from '@/modules/vehicles/hooks/useVehicles';
import { useDeleteVehicle } from '@/modules/vehicles/hooks/useVehicleMutations';
import { VehicleStatsCards } from '@/modules/vehicles/components/VehicleStatsCards';
import { VehicleFilters } from '@/modules/vehicles/components/VehicleFilters';
import { VehicleModal } from '@/modules/vehicles/components/VehicleModal';
import { FilterBar } from '@/shared/ui/filters/FilterBar';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Car, Edit, Trash2, ChevronRight, X } from 'lucide-react';
import { Vehicle, VehicleFilters as VehicleFiltersType } from '@/shared/types/vehicle.types';
import { usePagination } from '@/shared/hooks/usePagination';
import { useDebouncedSearch } from '@/shared/hooks/useDebouncedSearch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Tab sections
import VehicleDetailSection from '@/components/vehicles/sections/VehicleDetailSection';
import ExpenseSection from '@/components/vehicles/sections/ExpenseSection';
import FuelLogSection from '@/components/vehicles/sections/FuelLogSection';
import MeterLogSection from '@/components/vehicles/sections/MeterLogSection';
import MaintenanceSection from '@/components/vehicles/sections/MaintenanceSection';
import TripLogSection from '@/components/vehicles/sections/TripLogSection';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-800',
  maintenance: 'bg-yellow-100 text-yellow-800',
};

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'fuel', label: 'Fuel Logs' },
  { key: 'meter', label: 'Meter Logs' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'trips', label: 'Trip Logs' },
];

export default function VehiclesPage() {
  const [filters, setFilters] = useState<VehicleFiltersType>({});
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);

  const { page, pageSize, goToPage } = usePagination({ initialPageSize: 10 });
  const { searchTerm, setSearchTerm, clearSearch } = useDebouncedSearch({
    onSearch: (value) => {
      setFilters((prev) => ({ ...prev, license_plate: value || undefined }));
      goToPage(1);
    },
  });

  const { data: vehiclesData, isLoading: isLoadingVehicles, refetch } = useVehicles(
    filters,
    page,
    pageSize
  );
  const { data: stats, isLoading: isLoadingStats, refetch: refetchStats } = useVehicleStats();
  const deleteMutation = useDeleteVehicle();

  const handleDelete = async (vehicle: Vehicle, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete ${vehicle.license_plate}? This cannot be undone.`)) return;
    try {
      await deleteMutation.mutateAsync({ id: vehicle._id! });
      if (selectedVehicle?._id === vehicle._id) {
        setSelectedVehicle(null);
      }
      refetch();
      refetchStats();
    } catch {
      toast.error('Failed to delete vehicle');
    }
  };

  const handleEdit = (vehicle: Vehicle, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingVehicle(vehicle);
    setIsModalOpen(true);
  };

  const handleAddVehicle = () => {
    setEditingVehicle(null);
    setIsModalOpen(true);
  };

  const handleRowClick = (vehicle: Vehicle) => {
    if (selectedVehicle?._id === vehicle._id) {
      setSelectedVehicle(null);
    } else {
      setSelectedVehicle(vehicle);
      setActiveTab('overview');
    }
  };

  const handleModalSuccess = useCallback(() => {
    refetch();
    refetchStats();
    setEditingVehicle(null);
  }, [refetch, refetchStats]);

  const pagination = vehiclesData?.pagination
    ? {
        page: vehiclesData.pagination.page,
        pageSize: vehiclesData.pagination.limit,
        total: vehiclesData.pagination.total,
        totalPages: vehiclesData.pagination.totalPages,
        onPageChange: goToPage,
      }
    : undefined;

  const vehicles = vehiclesData?.data || [];

  return (
    <div className="flex h-full">
      {/* Left panel - vehicle list */}
      <div
        className={cn(
          'flex flex-col transition-all duration-300',
          selectedVehicle ? 'w-1/2 border-r' : 'w-full'
        )}
      >
        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Car className="h-6 w-6 text-blue-600" />
              Vehicles
            </h1>
            <Button onClick={handleAddVehicle}>
              <Plus className="h-4 w-4 mr-2" />
              Add Vehicle
            </Button>
          </div>

          {/* Stats */}
          <VehicleStatsCards stats={stats} isLoading={isLoadingStats} />

          {/* Search + Filters */}
          <FilterBar
            searchPlaceholder="Search by license plate..."
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            onSearchClear={clearSearch}
            filters={
              <VehicleFilters filters={filters} onFilterChange={(f) => { setFilters(f); goToPage(1); }} />
            }
          />

          {/* Table */}
          {isLoadingVehicles && !vehiclesData ? (
            <LoadingState type="table" />
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Vehicle</th>
                    {!selectedVehicle && (
                      <>
                        <th className="text-left p-3 font-medium">Year</th>
                        <th className="text-left p-3 font-medium">Fuel</th>
                        <th className="text-left p-3 font-medium">Status</th>
                      </>
                    )}
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.length === 0 ? (
                    <tr>
                      <td colSpan={selectedVehicle ? 2 : 5} className="text-center py-12 text-muted-foreground">
                        <Car className="mx-auto mb-2 h-8 w-8 opacity-40" />
                        <p>No vehicles found</p>
                        <Button variant="link" onClick={handleAddVehicle} className="mt-1">
                          Add your first vehicle
                        </Button>
                      </td>
                    </tr>
                  ) : (
                    vehicles.map((vehicle) => {
                      const isSelected = selectedVehicle?._id === vehicle._id;
                      return (
                        <tr
                          key={vehicle._id}
                          onClick={() => handleRowClick(vehicle)}
                          className={cn(
                            'cursor-pointer border-t transition-colors',
                            isSelected
                              ? 'bg-blue-50 dark:bg-blue-950/30'
                              : 'hover:bg-muted/40'
                          )}
                        >
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {vehicle.color && (
                                <div
                                  className="h-3 w-3 rounded-full border shrink-0"
                                  style={{ backgroundColor: vehicle.color }}
                                />
                              )}
                              <div>
                                <p className="font-mono font-semibold text-xs">
                                  {vehicle.license_plate}
                                </p>
                                <p className="text-muted-foreground text-xs">
                                  {vehicle.make} {vehicle.model}
                                </p>
                              </div>
                              {isSelected && (
                                <ChevronRight className="ml-auto h-4 w-4 text-blue-600" />
                              )}
                            </div>
                          </td>
                          {!selectedVehicle && (
                            <>
                              <td className="p-3 text-muted-foreground">{vehicle.year}</td>
                              <td className="p-3 text-muted-foreground">{vehicle.fuel_type}</td>
                              <td className="p-3">
                                <Badge
                                  className={cn(
                                    'text-xs',
                                    STATUS_COLORS[vehicle.status || 'active']
                                  )}
                                >
                                  {vehicle.status || 'active'}
                                </Badge>
                              </td>
                            </>
                          )}
                          <td className="p-3">
                            <div
                              className="flex justify-end gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => handleEdit(vehicle, e)}
                                title="Edit vehicle"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={(e) => handleDelete(vehicle, e)}
                                title="Delete vehicle"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
                  <span className="text-xs text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page === 1}
                      onClick={() => pagination.onPageChange(pagination.page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page === pagination.totalPages}
                      onClick={() => pagination.onPageChange(pagination.page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right panel - vehicle detail with tabs */}
      {selectedVehicle && (
        <div className="w-1/2 flex flex-col h-full overflow-hidden">
          {/* Detail header */}
          <div className="flex items-center justify-between px-6 py-4 border-b bg-background shrink-0">
            <div className="flex items-center gap-3">
              {selectedVehicle.color && (
                <div
                  className="h-5 w-5 rounded-full border-2 shadow-sm"
                  style={{ backgroundColor: selectedVehicle.color }}
                />
              )}
              <div>
                <h2 className="font-bold text-lg font-mono">
                  {selectedVehicle.license_plate}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}
                </p>
              </div>
              <Badge
                className={cn(
                  'ml-2',
                  STATUS_COLORS[selectedVehicle.status || 'active']
                )}
              >
                {selectedVehicle.status || 'active'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => handleEdit(selectedVehicle, e)}
              >
                <Edit className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedVehicle(null)}
                title="Close panel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b bg-background shrink-0 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px',
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto">
            <div className="p-4">
              {activeTab === 'overview' && (
                <VehicleDetailSection vehicle={selectedVehicle} />
              )}
              {activeTab === 'expenses' && (
                <ExpenseSection vehicle={selectedVehicle} />
              )}
              {activeTab === 'fuel' && (
                <FuelLogSection vehicle={selectedVehicle} />
              )}
              {activeTab === 'meter' && (
                <MeterLogSection vehicle={selectedVehicle} />
              )}
              {activeTab === 'maintenance' && (
                <MaintenanceSection vehicle={selectedVehicle} />
              )}
              {activeTab === 'trips' && (
                <TripLogSection vehicle={selectedVehicle} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <VehicleModal
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) setEditingVehicle(null);
        }}
        vehicle={editingVehicle}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
}