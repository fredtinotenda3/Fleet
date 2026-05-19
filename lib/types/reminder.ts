// lib/types/reminder.ts

export interface Reminder {
  title: string;
  _id?: string;
  license_plate: string;
  reminder_type: string;
  due_date: string | Date;
  description?: string;
  status?: "due" | "not due";
}

// NEW: Maintenance Service Types based on your requirements
export type MaintenanceCategory = 
  | "braking_system"
  | "fuel_system"
  | "spring_suspension"
  | "auto_electricals"
  | "engine_gearbox"
  | "cab_body";

export interface MaintenanceService extends Reminder {
  category: MaintenanceCategory;
  priority: "critical" | "high" | "medium" | "low";
  estimated_cost?: number;
  parts_required?: string[];
  completed_at?: Date;
  technician_notes?: string;
}

// Service items for each category
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

// Priority mapping based on safety/urgency
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