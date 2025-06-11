// types.ts

export type Vehicle = {
  color: string;
  vin: string;
  _id?: string;
  license_plate: string;
  make: string;
  model: string;
  year: number;
  vehicle_type: string;
  purchase_date: string;
  fuel_type: string;
  status?: "active" | "inactive" | "maintenance"; // Add status field
  registration_expiry?: string;
  insurance_provider?: string;
  last_service_date?: string;
  service_interval?: number;
  odometer?: number;
  createdAt?: Date;
};

export type Expense = {
  _id?: string;
  license_plate: string;
  amount: number;
  date: Date;
  description?: string;
  jobTrip?: string;
  notes?: string;
  expense_type_id: string;
  expense_type?: ExpenseType;
};

export type ExpenseType = {
  _id?: string;
  name: string;
  category: string;
  description?: string;
};

export type FuelLog = {
  _id?: string;
  license_plate: string;
  date: Date | string;
  fuel_volume: number;
  unit_id: string;
  cost: number;
  odometer: number;
  unit?: {
    name: string;
    symbol: string;
  };
};

export type MeterLog = {
  _id?: string;
  license_plate: string;
  date: Date;
  odometer: number;
  unit: string;
  unit_id: string;
};

export type Reminder = {
  completion_date: string;
  cost: boolean;
  _id?: string;
  license_plate: string;
  title: string;
  due_date: string;
  notes?: string;
  status: "pending" | "due" | "completed" | "overdue";
  priority: "high" | "medium" | "low";
  service_type: string;
  recurrence_interval?: string;
  next_due_odometer?: number;
};

export type PaginatedResponse<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type ApiFilter = {
  license_plate?: string;
  make?: string;
  model?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};

export type Unit = {
  type: string;
  _id: string;
  name: string;
  symbol: string;
  unit_id: string;
};
