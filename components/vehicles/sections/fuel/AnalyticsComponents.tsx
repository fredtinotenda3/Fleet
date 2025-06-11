// components/vehicles/sections/fuel/AnalyticsComponents.tsx
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, formatDate } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
import { ReactNode } from "react";

// Date Picker Component
interface DatePickerProps {
  date?: Date;
  setDate: (date?: Date) => void;
  label: string;
}

export const DatePicker = ({ date, setDate, label }: DatePickerProps) => (
  <div className="flex-1">
    <label className="text-sm font-medium">{label}</label>
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? formatDate(date) : <span>Select date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar mode="single" selected={date} onSelect={setDate} />
      </PopoverContent>
    </Popover>
  </div>
);

// Stat Card Component
interface StatCardProps {
  icon: ReactNode;
  title: string;
  value: string;
  color: string;
}

export const StatCard = ({ icon, title, value, color }: StatCardProps) => (
  <div className={cn("p-6 rounded-lg border", color)}>
    <div className="flex items-center gap-4">
      <div className="p-2 rounded-full bg-background">{icon}</div>
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  </div>
);

// Pagination Controls Component
interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  loading?: boolean;
}

export const PaginationControls = ({
  currentPage,
  totalPages,
  onPrevious,
  onNext,
  loading = false,
}: PaginationControlsProps) => (
  <div className="flex justify-between items-center">
    <Button
      variant="outline"
      disabled={currentPage === 1 || loading}
      onClick={onPrevious}
    >
      Previous
    </Button>
    <span className="text-sm">
      Page {currentPage} of {totalPages}
    </span>
    <Button
      variant="outline"
      disabled={currentPage === totalPages || loading}
      onClick={onNext}
    >
      Next
    </Button>
  </div>
);
