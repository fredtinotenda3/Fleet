"use client";

import { Button } from "@/components/ui/button";
import { startOfMonth, startOfYear, subMonths, subYears } from "date-fns";

interface DateRangePresetsProps {
  onSelect: (start: Date | undefined, end: Date | undefined) => void;
  activePreset?: string;
}

const PRESETS = [
  {
    label: "This month",
    key: "this_month",
    getRange: () => ({ start: startOfMonth(new Date()), end: new Date() }),
  },
  {
    label: "Last 3 months",
    key: "last_3",
    getRange: () => ({ start: subMonths(new Date(), 3), end: new Date() }),
  },
  {
    label: "Last 6 months",
    key: "last_6",
    getRange: () => ({ start: subMonths(new Date(), 6), end: new Date() }),
  },
  {
    label: "This year",
    key: "this_year",
    getRange: () => ({ start: startOfYear(new Date()), end: new Date() }),
  },
  {
    label: "Last year",
    key: "last_year",
    getRange: () => ({
      start: startOfYear(subYears(new Date(), 1)),
      end: new Date(new Date().getFullYear() - 1, 11, 31),
    }),
  },
  {
    label: "All time",
    key: "all",
    getRange: () => ({ start: undefined, end: undefined }),
  },
];

export function DateRangePresets({ onSelect, activePreset }: DateRangePresetsProps) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-sm text-muted-foreground mr-1">Quick:</span>
      {PRESETS.map((preset) => {
        const isActive = activePreset === preset.key;
        return (
          <Button
            key={preset.key}
            variant={isActive ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs px-3"
            onClick={() => {
              const { start, end } = preset.getRange();
              onSelect(start, end);
            }}
          >
            {preset.label}
          </Button>
        );
      })}
    </div>
  );
}
