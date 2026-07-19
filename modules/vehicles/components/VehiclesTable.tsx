// C:\Users\user\Desktop\Fleet\modules\vehicles\components\VehiclesTable.tsx

'use client';

import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/shared/ui/tables/DataTable';
import { Vehicle } from '@/shared/types/vehicle.types';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Edit, Trash2, Eye } from 'lucide-react';
import { getStatusConfig } from '@/shared/utils/status.utils';

interface VehiclesTableProps {
  data: Vehicle[];
  isLoading: boolean;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  };
  onView?: (vehicle: Vehicle) => void;
  onEdit?: (vehicle: Vehicle) => void;
  onDelete?: (vehicle: Vehicle) => void;
  onStatusChange?: (vehicleId: string, newStatus: Vehicle['status']) => void;
  onSelectVehicle?: (vehicle: Vehicle) => void;
}

export function VehiclesTable({ 
  data, 
  isLoading, 
  pagination, 
  onView, 
  onEdit, 
  onDelete, 
  onSelectVehicle 
}: VehiclesTableProps) {
  console.log('VehiclesTable - data:', data); // Add this debug line

  const columns: ColumnDef<Vehicle>[] = [
    {
      accessorKey: 'license_plate',
      header: 'License Plate',
      cell: ({ row }) => {
        const color = row.original.color;
        return (
          <div className="flex items-center gap-2">
            {color && (
              <div
                className="h-4 w-4 rounded-full border"
                style={{ backgroundColor: color }}
              />
            )}
            <span className="font-mono font-medium">{row.getValue('license_plate')}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'make',
      header: 'Make',
    },
    {
      accessorKey: 'model',
      header: 'Model',
    },
    {
      accessorKey: 'year',
      header: 'Year',
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue('status') as string;
        const config = getStatusConfig(status as any);
        return <Badge className={config.color}>{config.label}</Badge>;
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const vehicle = row.original;
        return (
          <div className="flex items-center gap-2">
            {onView && (
              <Button variant="ghost" size="sm" onClick={() => onView(vehicle)}>
                <Eye className="h-4 w-4" />
              </Button>
            )}
            {onEdit && (
              <Button variant="ghost" size="sm" onClick={() => onEdit(vehicle)}>
                <Edit className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="sm" onClick={() => onDelete(vehicle)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      pagination={pagination}
      onRowClick={onSelectVehicle || onView}
      emptyMessage="No vehicles found"
    />
  );
}