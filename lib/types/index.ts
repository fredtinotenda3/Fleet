// /types/index.ts

export type Vehicle = {
  _id?: string;
  license_plate: string;
  make: string;
  model: string;
  year: number;
  color?: string;
  vin?: string;
  owner_id?: string;
  created_at?: string;
};

export type Expense = {
  _id?: string;
  license_plate: string;
  type_id: string;
  amount: number;
  date: string;
  notes?: string;
  created_at?: string;
};

export type FuelLog = {
  _id?: string;
  license_plate: string;
  fuel_type: string;
  amount: number;
  cost: number;
  date: string;
  station?: string;
  odometer?: number;
  notes?: string;
};

export type MeterLog = {
  _id?: string;
  license_plate: string;
  reading: number;
  date: string;
  notes?: string;
};

export type Reminder = {
  _id?: string;
  license_plate: string;
  title: string;
  due_date: string;
  status: "pending" | "completed" | "overdue";
  description?: string;
  created_at?: string;
};

export type ExpenseType = {
  _id?: string;
  name: string;
  description?: string;
};

export type Unit = {
  _id?: string;
  name: string;
  symbol: string;
};
