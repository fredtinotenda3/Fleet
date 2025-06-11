import { Droplet, DollarSign, Divide, ListOrdered } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const FuelStats = ({
  totalFuel,
  totalCost,
  averageCostPerUnit,
  logCount,
  unitSymbol = "",
}: {
  totalFuel: number;
  totalCost: number;
  averageCostPerUnit: number;
  logCount: number;
  unitSymbol?: string;
}) => {
  const stats = [
    {
      label: "Total Fuel",
      value: `${totalFuel.toFixed(2)} ${unitSymbol}`,
      icon: <Droplet className="w-5 h-5 text-blue-500" />,
      tooltip: "Total amount of fuel consumed",
    },
    {
      label: "Total Cost",
      value: `$${totalCost.toFixed(2)}`,
      icon: <DollarSign className="w-5 h-5 text-green-500" />,
      tooltip: "Total cost spent on fuel",
    },
    {
      label: "Avg Cost/Unit",
      value: `$${averageCostPerUnit.toFixed(2)}`,
      icon: <Divide className="w-5 h-5 text-purple-500" />,
      tooltip: "Average cost per unit of fuel",
    },
    {
      label: "Entries",
      value: logCount.toString(),
      icon: <ListOrdered className="w-5 h-5 text-orange-500" />,
      tooltip: "Number of fuel log entries",
    },
  ];

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all bg-white dark:bg-gray-900"
          >
            <div className="flex items-center gap-2 mb-1">
              {stat.icon}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="font-medium cursor-help">{stat.label}</span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-xs">
                  {stat.tooltip}
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="text-2xl font-semibold">{stat.value}</div>
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
};
