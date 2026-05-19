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
  status?: "active" | "inactive" | "maintenance";
  fuel_type?: string;
  purchase_date?: string;
  vehicle_type?: string;
};

export type Expense = {
  _id?: string;
  license_plate: string;
  type_id?: string;
  expense_type_id?: string;
  expense_type?: ExpenseType;
  amount: number;
  date: Date | string;
  description?: string;
  jobTrip?: string;
  notes?: string;
  created_at?: string;
};

export type FuelLog = {
  _id?: string;
  license_plate: string;
  fuel_volume: number;
  cost: number;
  date: Date | string;
  unit_id: string;
  unit?: Unit;
  odometer?: number;
  notes?: string;
};

export type MeterLog = {
  _id?: string;
  license_plate: string;
  odometer: number;
  date: Date | string;
  unit_id: string;
  unit?: Unit;
  notes?: string;
};

export type Trip = {
  _id?: string;
  license_plate: string;
  date: Date | string;
  mode: "distance" | "odometer";
  distance_calculated: number;
  unit_id: string;
  trip_distance?: number;
  start_odometer?: number;
  end_odometer?: number;
  notes?: string;
  created_at?: Date;
};

export type Reminder = {
  _id?: string;
  license_plate: string;
  title: string;
  due_date: Date | string;
  status: "pending" | "completed" | "overdue";
  notes?: string;
  recurrence_interval?: string;
  completion_date?: Date | string;
  priority?: "critical" | "high" | "medium" | "low";
  category?: MaintenanceCategory;
  estimated_cost?: number;
};

export type ExpenseType = {
  _id?: string;
  name: string;
  category?: string;
  description?: string;
  isDeleted?: boolean;
};

export type Unit = {
  _id?: string;
  unit_id: string;
  name: string;
  symbol: string;
  type: "distance" | "volume" | "currency";
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
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};

// NEW: Maintenance Types
export type MaintenanceCategory = 
  | "braking_system"
  | "fuel_system"
  | "spring_suspension"
  | "auto_electricals"
  | "engine_gearbox"
  | "cab_body";

export const MAINTENANCE_ITEMS: Record<MaintenanceCategory, string[]> = {
  braking_system: [
    "Airline leak or bulge",
    "Loose mounding bolts",
    "Evidence of oil seepage",
    "Cracked brake drums",
    "Inoperative low air warning device",
    "Master cylinder leakage",
    "Check clutch pedal free travel and linkage",
    "Adjust brakes",
    "Check and adjust pedal free travel",
    "Check master cylinder fluids",
    "Exhaust leak forward or below the gas"
  ],
  fuel_system: [
    "Visible fuel leak",
    "Fuel tank repairs",
    "Cooling system check"
  ],
  spring_suspension: [
    "Cracked, loose or missing U bolt",
    "Broken main leaf in leaf spring",
    "Displaced leaf contacting tire",
    "Broken or missing shocks",
    "Missing or broken axle bolts",
    "Drain drum, gear box and axle",
    "Flush and refill lubricants",
    "Oil, brake fluid, shock absorber check",
    "Steering joints, U bolts to torque specs",
    "Lubricate rear axle bearing",
    "Tighten rear axle shaft nuts",
    "Check wheel alignment",
    "Tyre replacements",
    "Excessive free play check",
    "Worn or faulty universal joints",
    "Steering wheel securement",
    "Loose tire rod ends"
  ],
  auto_electricals: [
    "Visual cracks or distortion in lights",
    "Both brake lights inoperative",
    "Both taillights inoperative",
    "Turn signal inoperative",
    "Inoperative siren",
    "Emergency lighting not visible",
    "Aim headlights",
    "Battery clean and tighten terminals",
    "Operation of all instruments",
    "Lights, horns and accessories check",
    "Adjust fan belt tension",
    "Coolant leak at water pump",
    "Major coolant leak",
    "Automatic transmission overheating",
    "Defective clutch components",
    "Defective foot throttle",
    "Defective charging system",
    "Alternator or starter issues",
    "Electrical wiring check"
  ],
  engine_gearbox: [
    "Engine overhaul",
    "New Engine installation",
    "New gear box installation",
    "Engine coolant in motor oil",
    "Tune engine including tappets",
    "Adjust ignition timing",
    "Oil change",
    "Filter replacements"
  ],
  cab_body: [
    "Missing or broken mirrors",
    "Defective doors",
    "Operation of body hardware",
    "Doors, glasses, locks and keys check",
    "Cab body inspection",
    "Body panel repairs"
  ]
};

export const getPriorityFromItem = (item: string): "critical" | "high" | "medium" | "low" => {
  const criticalItems = [
    "Airline leak or bulge",
    "Visible fuel leak",
    "Cracked brake drums",
    "Inoperative low air warning device",
    "Any broken main leaf",
    "Both brake lights missing",
    "Inoperative siren",
    "Engine coolant in motor oil"
  ];
  
  const highItems = [
    "Loose mounding bolts",
    "Evidence of oil seepage",
    "Master cylinder leakage",
    "Fuel tank repairs",
    "Broken or missing shocks",
    "Excessive free play",
    "Loose tire rod ends",
    "Defective doors",
    "Defective clutch components"
  ];
  
  if (criticalItems.includes(item)) return "critical";
  if (highItems.includes(item)) return "high";
  return "medium";
};