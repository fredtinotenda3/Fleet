/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Trip, Unit } from "@/types";
import { toast } from "sonner";
import { Trash2, Edit, Plus, Route, Gauge, MapPin } from "lucide-react";
import { format } from "date-fns";

interface TripLogSectionProps {
  vehicle: { license_plate: string };
}

// Define payload type instead of using any
interface TripPayload {
  license_plate: string;
  mode: "distance" | "odometer";
  date: string;
  notes: string;
  unit_id: string;
  trip_distance?: number;
  start_odometer?: number;
  end_odometer?: number;
}

// Define error response type
interface ErrorResponse {
  error: string;
}

export default function TripLogSection({ vehicle }: TripLogSectionProps) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editTrip, setEditTrip] = useState<Trip | null>(null);
  const [mode, setMode] = useState<"distance" | "odometer">("distance");
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    trip_distance: "",
    start_odometer: "",
    end_odometer: "",
    unit_id: "",
    notes: "",
  });

  const fetchTrips = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/trips?license_plate=${vehicle.license_plate}`
      );
      if (!res.ok) throw new Error("Failed to fetch trips");
      const data = await res.json();
      // Handle both paginated and non-paginated responses
      const tripsData = Array.isArray(data) ? data : data.data || [];
      setTrips(tripsData);
    } catch (error) {
      toast.error("Failed to load trip logs");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [vehicle.license_plate]);

  const fetchUnits = useCallback(async () => {
    try {
      const res = await fetch("/api/units?type=distance");
      if (!res.ok) throw new Error("Failed to fetch units");
      const data = await res.json();
      setUnits(data);
    } catch (error) {
      toast.error("Failed to load distance units");
      console.error(error);
    }
  }, []);

  // Separate useEffect to set default unit after units are loaded
  useEffect(() => {
    if (units.length > 0 && !formData.unit_id) {
      setFormData(prev => ({ ...prev, unit_id: units[0].unit_id }));
    }
  }, [units, formData.unit_id]);

  useEffect(() => {
    fetchTrips();
    fetchUnits();
  }, [fetchTrips, fetchUnits]);

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split("T")[0],
      trip_distance: "",
      start_odometer: "",
      end_odometer: "",
      unit_id: units[0]?.unit_id || "",
      notes: "",
    });
    setMode("distance");
    setEditTrip(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload: TripPayload = {
      license_plate: vehicle.license_plate,
      mode,
      date: formData.date,
      notes: formData.notes,
      unit_id: formData.unit_id,
    };

    if (mode === "distance") {
      const distance = parseFloat(formData.trip_distance);
      if (isNaN(distance) || distance <= 0) {
        toast.error("Please enter a valid trip distance greater than 0");
        return;
      }
      payload.trip_distance = distance;
    } else {
      const start = parseFloat(formData.start_odometer);
      const end = parseFloat(formData.end_odometer);
      if (isNaN(start) || start < 0) {
        toast.error("Please enter a valid start odometer reading");
        return;
      }
      if (isNaN(end) || end < 0) {
        toast.error("Please enter a valid end odometer reading");
        return;
      }
      if (end < start) {
        toast.error("End odometer cannot be less than start odometer");
        return;
      }
      payload.start_odometer = start;
      payload.end_odometer = end;
    }

    try {
      const url = editTrip?._id
        ? `/api/trips?id=${editTrip._id}`
        : "/api/trips";
      const method = editTrip?._id ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = (await res.json()) as ErrorResponse;
        throw new Error(error.error || "Failed to save trip");
      }

      toast.success(
        `Trip ${editTrip?._id ? "updated" : "logged"} successfully`
      );
      fetchTrips();
      setOpen(false);
      resetForm();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Error saving trip";
      toast.error(errorMessage);
    }
  };

  const handleDelete = async (tripId: string) => {
    toast("Are you sure you want to delete this trip?", {
      action: {
        label: "Delete",
        onClick: async () => {
          try {
            const res = await fetch(`/api/trips?id=${tripId}`, {
              method: "DELETE",
            });
            if (!res.ok) throw new Error("Delete failed");
            toast.success("Trip deleted successfully");
            fetchTrips();
          } catch (error) {
            toast.error("Failed to delete trip");
          }
        },
      },
      cancel: { label: "Cancel", onClick: () => {} },
    });
  };

  const handleEdit = (trip: Trip) => {
    setEditTrip(trip);
    setMode(trip.mode);
    setFormData({
      date: trip.date ? new Date(trip.date).toISOString().split("T")[0] : "",
      trip_distance: trip.trip_distance?.toString() || "",
      start_odometer: trip.start_odometer?.toString() || "",
      end_odometer: trip.end_odometer?.toString() || "",
      unit_id: trip.unit_id || units[0]?.unit_id || "",
      notes: trip.notes || "",
    });
    setOpen(true);
  };

  const getUnitSymbol = (unitId: string) => {
    const unit = units.find(u => u.unit_id === unitId);
    return unit?.symbol || "km";
  };

  const formatDate = (date: Date | string) => {
    return format(new Date(date), "MMM dd, yyyy");
  };

  const totalDistance = trips.reduce(
    (sum, trip) => sum + trip.distance_calculated,
    0
  );

  return (
    <div className="space-y-6">
      {/* Header with stats */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Route className="h-5 w-5 text-blue-600" />
            Manual Trip Logs
          </h3>
          <p className="text-sm text-muted-foreground">
            Track distance when odometer readings aren&apos;t available
          </p>
        </div>
        <Button onClick={() => {
          resetForm();
          setOpen(true);
        }}>
          <Plus className="h-4 w-4 mr-2" />
          Log Trip
        </Button>
      </div>

      {/* Summary Card */}
      {trips.length > 0 && (
        <div className="bg-muted/30 rounded-lg p-4 border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <MapPin className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Manual Distance</p>
                <p className="text-2xl font-bold">
                  {totalDistance.toLocaleString()} {getUnitSymbol(formData.unit_id)}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">
              {trips.length} trip{trips.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>
      )}

      {/* Trip Logs Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Distance</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  <div className="flex justify-center">
                    <div className="animate-pulse text-muted-foreground">
                      Loading trips...
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : trips.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  <Route className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No manual trips logged yet
                </TableCell>
              </TableRow>
            ) : (
              trips.map((trip) => (
                <TableRow key={trip._id}>
                  <TableCell>{formatDate(trip.date)}</TableCell>
                  <TableCell className="font-mono">
                    {trip.distance_calculated.toLocaleString()} {getUnitSymbol(trip.unit_id)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={trip.mode === "distance" ? "default" : "secondary"}
                      className="capitalize"
                    >
                      {trip.mode === "distance" ? (
                        <span className="flex items-center gap-1">
                          <Route className="h-3 w-3" />
                          Direct
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Gauge className="h-3 w-3" />
                          Odometer
                        </span>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {trip.notes || "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(trip)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => trip._id && handleDelete(trip._id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Trip Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editTrip ? "Edit Trip" : "Log Manual Trip"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Mode Toggle */}
            <div>
              <Label>Logging Mode</Label>
              <div className="flex gap-2 mt-1">
                <Button
                  type="button"
                  variant={mode === "distance" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setMode("distance")}
                >
                  <Route className="h-4 w-4 mr-2" />
                  Distance
                </Button>
                <Button
                  type="button"
                  variant={mode === "odometer" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setMode("odometer")}
                >
                  <Gauge className="h-4 w-4 mr-2" />
                  Odometer
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {mode === "distance"
                  ? "Enter the distance traveled directly"
                  : "Enter start and end odometer readings"}
              </p>
            </div>

            {/* Date */}
            <div>
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) =>
                  setFormData({ ...formData, date: e.target.value })
                }
                required
              />
            </div>

            {/* Unit */}
            <div>
              <Label htmlFor="unit_id">Distance Unit *</Label>
              <select
                id="unit_id"
                value={formData.unit_id}
                onChange={(e) =>
                  setFormData({ ...formData, unit_id: e.target.value })
                }
                className="w-full p-2 border rounded-md text-sm"
                required
              >
                <option value="">Select unit</option>
                {units.map((unit) => (
                  <option key={unit.unit_id} value={unit.unit_id}>
                    {unit.name} ({unit.symbol})
                  </option>
                ))}
              </select>
            </div>

            {/* Mode-specific fields */}
            {mode === "distance" ? (
              <div>
                <Label htmlFor="trip_distance">Distance Traveled *</Label>
                <Input
                  id="trip_distance"
                  type="number"
                  step="any"
                  min="0.01"
                  placeholder="e.g., 120.5"
                  value={formData.trip_distance}
                  onChange={(e) =>
                    setFormData({ ...formData, trip_distance: e.target.value })
                  }
                  required
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="start_odometer">Start Odometer *</Label>
                  <Input
                    id="start_odometer"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g., 15000"
                    value={formData.start_odometer}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        start_odometer: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="end_odometer">End Odometer *</Label>
                  <Input
                    id="end_odometer"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g., 15250"
                    value={formData.end_odometer}
                    onChange={(e) =>
                      setFormData({ ...formData, end_odometer: e.target.value })
                    }
                    required
                  />
                </div>
                {formData.start_odometer && formData.end_odometer && (
                  <p className="text-sm text-muted-foreground">
                    Distance:{" "}
                    <span className="font-mono font-medium">
                      {(
                        parseFloat(formData.end_odometer) -
                        parseFloat(formData.start_odometer)
                      ).toLocaleString()}{" "}
                      {getUnitSymbol(formData.unit_id)}
                    </span>
                  </p>
                )}
              </div>
            )}

            {/* Notes */}
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Optional notes about this trip..."
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit">
                {editTrip ? "Update" : "Log Trip"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}