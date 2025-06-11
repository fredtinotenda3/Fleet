/* eslint-disable @typescript-eslint/no-unused-expressions */
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginatedResponse, Vehicle } from "@/types";
import { StatusDropdownSelect } from "../ui/StatusDropdownSelect";

const headers = ["License Plate", "Make", "Model", "Year", "Status", "Actions"];

export const VehiclesTable = ({
  data,
  loading,
  onPageChange,
  onEdit,
  onDelete,
  onStatusChange,
  onSelectVehicle,
}: {
  data: PaginatedResponse<Vehicle>;
  loading?: boolean;
  onPageChange: (newPage: number) => void;
  onEdit: (vehicle: Vehicle) => void;
  onDelete: (id: string) => void;
  onStatusChange: (vehicleId: string, newStatus: Vehicle["status"]) => void;
  onSelectVehicle: (vehicle: Vehicle) => void;
}) => (
  <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((header) => (
            <TableHead key={header}>{header}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell colSpan={headers.length} className="text-center py-4">
              Loading vehicles...
            </TableCell>
          </TableRow>
        ) : data.data.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={headers.length}
              className="text-center py-4 text-gray-500"
            >
              No vehicles found.
            </TableCell>
          </TableRow>
        ) : (
          data.data.map((vehicle) => (
            <TableRow
              key={vehicle._id}
              onClick={() => onSelectVehicle(vehicle)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSelectVehicle(vehicle);
              }}
              className="cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <TableCell className="font-medium">
                {vehicle.license_plate}
              </TableCell>
              <TableCell>{vehicle.make}</TableCell>
              <TableCell>{vehicle.model}</TableCell>
              <TableCell>{vehicle.year}</TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <StatusDropdownSelect
                  status={vehicle.status || "active"}
                  vehicleId={vehicle._id!}
                  onStatusChange={onStatusChange}
                />
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mr-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(vehicle);
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    vehicle._id && onDelete(vehicle._id);
                  }}
                >
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>

    {data.data.length > 0 && (
      <div className="flex justify-between items-center mt-4">
        <Button
          variant="outline"
          disabled={data.pagination.page === 1}
          onClick={() => onPageChange(data.pagination.page - 1)}
        >
          Previous
        </Button>
        <span>
          Page {data.pagination.page} of {data.pagination.totalPages}
        </span>
        <Button
          variant="outline"
          disabled={data.pagination.page >= data.pagination.totalPages}
          onClick={() => onPageChange(data.pagination.page + 1)}
        >
          Next
        </Button>
      </div>
    )}
  </div>
);
