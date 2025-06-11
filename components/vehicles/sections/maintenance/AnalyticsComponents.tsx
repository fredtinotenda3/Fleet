/* eslint-disable @typescript-eslint/no-unused-vars */
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { buttonVariants } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";

export const DatePicker = ({
  selected,
  onSelect,
  placeholder,
  label,
}: {
  selected?: Date;
  onSelect: (d?: Date) => void;
  placeholder: string;
  label: string;
}) => (
  <div className="flex-1">
    <label className="text-sm font-medium mb-1 block">{label}</label>
    <Popover>
      <PopoverTrigger asChild>
        <div
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-full justify-start text-left font-normal",
            !selected && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selected ? (
            format(selected, "MMM dd, yyyy")
          ) : (
            <span>{placeholder}</span>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={onSelect}
          initialFocus
          className="rounded-md border"
        />
      </PopoverContent>
    </Popover>
  </div>
);

export const StatCard = ({
  title,
  value,
  icon,
  delta,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  delta?: number;
}) => (
  <div className="border rounded-lg p-4">
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {icon}
    </div>
    <div className="mt-2">
      <div className="text-2xl font-bold">{value}</div>
      {delta && (
        <span
          className={cn(
            "text-sm",
            delta > 0 ? "text-green-500" : "text-red-500"
          )}
        >
          {delta > 0 ? "+" : ""}
          {delta.toFixed(1)}%
        </span>
      )}
    </div>
  </div>
);

export const PaginationControls = ({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) => (
  <div className="flex items-center justify-end space-x-2">
    <Button
      variant="outline"
      size="sm"
      disabled={currentPage <= 1}
      onClick={() => onPageChange(currentPage - 1)}
    >
      Previous
    </Button>
    <span className="text-sm">
      Page {currentPage} of {totalPages}
    </span>
    <Button
      variant="outline"
      size="sm"
      disabled={currentPage >= totalPages}
      onClick={() => onPageChange(currentPage + 1)}
    >
      Next
    </Button>
  </div>
);
