import { MeterLog } from "@/types/index";

export const StatsDisplay = ({ logs }: { logs: MeterLog[] }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div className="p-4 bg-muted rounded-lg">
      <p className="text-sm text-muted-foreground">Total Readings</p>
      <p className="text-2xl font-bold">
        {logs.reduce((sum, log) => sum + log.odometer, 0).toLocaleString()}
      </p>
    </div>
    <div className="p-4 bg-muted rounded-lg">
      <p className="text-sm text-muted-foreground">Average Reading</p>
      <p className="text-2xl font-bold">
        {logs.length > 0
          ? (
              logs.reduce((sum, log) => sum + log.odometer, 0) / logs.length
            ).toLocaleString()
          : 0}
      </p>
    </div>
  </div>
);
