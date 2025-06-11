// components/vehicles/sections/fuel/VehicleComparisonCharts.tsx
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { Vehicle } from "@/types";

const COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#A28FD0",
  "#FF6666",
  "#4ECDC4",
  "#FF6B6B",
  "#88D8B0",
  "#FFCC5C",
];

interface VehicleComparisonChartsProps {
  consumptionByVehicle: Record<string, number>;
  costByVehicle: Record<string, number>;
  efficiencyByVehicle: Record<string, number>;
  fuelVolumeByVehicle: Record<string, number>;
  fuelCostByVehicle: Record<string, number>;
  vehicles: Vehicle[];
}

export const VehicleComparisonCharts = ({
  consumptionByVehicle,
  costByVehicle,
  efficiencyByVehicle,
  fuelVolumeByVehicle,
  fuelCostByVehicle,
  vehicles,
}: VehicleComparisonChartsProps) => {
  // Prepare data for bar charts
  const consumptionData = Object.entries(consumptionByVehicle)
    .map(([licensePlate, totalVolume]) => ({
      licensePlate,
      totalVolume,
      vehicle: vehicles.find((v) => v.license_plate === licensePlate) || null,
    }))
    .filter((item) => item.vehicle) // Filter out vehicles not found
    .sort((a, b) => b.totalVolume - a.totalVolume);

  const costData = Object.entries(costByVehicle)
    .map(([licensePlate, totalCost]) => ({
      licensePlate,
      totalCost,
      vehicle: vehicles.find((v) => v.license_plate === licensePlate) || null,
    }))
    .filter((item) => item.vehicle)
    .sort((a, b) => b.totalCost - a.totalCost);

  const efficiencyData = Object.entries(efficiencyByVehicle)
    .map(([licensePlate, efficiency]) => ({
      licensePlate,
      efficiency,
      vehicle: vehicles.find((v) => v.license_plate === licensePlate) || null,
    }))
    .filter(
      (item) =>
        item.vehicle && !isNaN(item.efficiency) && isFinite(item.efficiency)
    )
    .sort((a, b) => b.efficiency - a.efficiency);

  // Prepare data for scatter plot
  const scatterData = Object.entries(fuelVolumeByVehicle)
    .map(([licensePlate, volume]) => ({
      licensePlate,
      volume,
      cost: fuelCostByVehicle[licensePlate] || 0,
      vehicle: vehicles.find((v) => v.license_plate === licensePlate) || null,
    }))
    .filter((item) => item.vehicle);

  // Prepare data for trends chart (top 5 vehicles)
  const topVehicles = consumptionData
    .slice(0, 5)
    .map((item) => item.licensePlate);
  const trendsData = Object.entries(consumptionByVehicle)
    .filter(([licensePlate]) => topVehicles.includes(licensePlate))
    .map(([licensePlate, totalVolume]) => ({
      licensePlate,
      totalVolume,
      vehicle: vehicles.find((v) => v.license_plate === licensePlate) || null,
    }));

  // Format vehicle names for display
  const formatVehicleLabel = (licensePlate: string) => {
    const vehicle = vehicles.find((v) => v.license_plate === licensePlate);
    if (!vehicle) return licensePlate;
    return `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      {/* Fuel Consumption by Vehicle */}
      <div className="border p-4 rounded-lg">
        <h4 className="text-sm font-medium mb-2">
          Fuel Consumption by Vehicle
        </h4>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={consumptionData}
              margin={{ top: 20, right: 30, left: 20, bottom: 70 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="licensePlate"
                angle={-45}
                textAnchor="end"
                height={60}
                tickFormatter={formatVehicleLabel}
              />
              <YAxis />
              <Tooltip
                formatter={(value) => [`${value} units`, "Volume"]}
                labelFormatter={formatVehicleLabel}
              />
              <Bar dataKey="totalVolume" name="Fuel Consumption">
                {consumptionData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Fuel Cost by Vehicle */}
      <div className="border p-4 rounded-lg">
        <h4 className="text-sm font-medium mb-2">Fuel Cost by Vehicle</h4>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={costData}
              margin={{ top: 20, right: 30, left: 20, bottom: 70 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="licensePlate"
                angle={-45}
                textAnchor="end"
                height={60}
                tickFormatter={formatVehicleLabel}
              />
              <YAxis />
              <Tooltip
                formatter={(value) => [`$${value}`, "Cost"]}
                labelFormatter={formatVehicleLabel}
              />
              <Bar dataKey="totalCost" name="Fuel Cost">
                {costData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Fuel Efficiency by Vehicle */}
      <div className="border p-4 rounded-lg">
        <h4 className="text-sm font-medium mb-2">Fuel Efficiency by Vehicle</h4>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={efficiencyData}
              margin={{ top: 20, right: 30, left: 20, bottom: 70 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="licensePlate"
                angle={-45}
                textAnchor="end"
                height={60}
                tickFormatter={formatVehicleLabel}
              />
              <YAxis />
              <Tooltip
                formatter={(value) =>
                  typeof value === "number"
                    ? [`${value.toFixed(2)} L/Km`, "Efficiency"]
                    : [value, "Efficiency"]
                }
                labelFormatter={formatVehicleLabel}
              />
              <Bar dataKey="efficiency" name="Fuel Efficiency">
                {efficiencyData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Fuel Volume vs. Fuel Cost */}
      <div className="border p-4 rounded-lg">
        <h4 className="text-sm font-medium mb-2">Fuel Volume vs. Cost</h4>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 70 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="volume"
                name="Fuel Volume"
                label={{
                  value: "Fuel Volume",
                  position: "bottom",
                  offset: -10,
                }}
              />
              <YAxis
                type="number"
                dataKey="cost"
                name="Cost"
                label={{
                  value: "Cost ($)",
                  angle: -90,
                  position: "insideLeft",
                }}
              />
              <ZAxis
                type="number"
                dataKey="cost"
                range={[50, 500]}
                name="Cost"
              />
              <Tooltip
                formatter={(value, name) => {
                  if (name === "volume") return [`${value} units`, "Volume"];
                  if (name === "cost") return [`$${value}`, "Cost"];
                  return [value, name];
                }}
                labelFormatter={formatVehicleLabel}
              />
              <Legend />
              <Scatter
                name="Vehicles"
                data={scatterData}
                fill="#8884d8"
                shape="circle"
              >
                {scatterData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Fuel Consumption Trends */}
      <div className="border p-4 rounded-lg md:col-span-2">
        <h4 className="text-sm font-medium mb-2">Fuel Consumption Trends</h4>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="licensePlate"
                tickFormatter={formatVehicleLabel}
              />
              <YAxis />
              <Tooltip
                formatter={(value) => [`${value} units`, "Volume"]}
                labelFormatter={formatVehicleLabel}
              />
              <Legend />
              {topVehicles.slice(0, 5).map((licensePlate, index) => (
                <Line
                  key={licensePlate}
                  type="monotone"
                  dataKey="totalVolume"
                  data={trendsData.filter(
                    (d) => d.licensePlate === licensePlate
                  )}
                  name={formatVehicleLabel(licensePlate)}
                  stroke={COLORS[index % COLORS.length]}
                  activeDot={{ r: 8 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
