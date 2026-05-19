"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

// Expense categories matching your maintenance categories
const EXPENSE_CATEGORIES = [
  { value: "braking_system", label: "Braking System" },
  { value: "fuel_system", label: "Fuel System" },
  { value: "spring_suspension", label: "Spring & Suspension" },
  { value: "auto_electricals", label: "Auto Electricals" },
  { value: "engine_gearbox", label: "Engine & Gearbox" },
  { value: "cab_body", label: "Cab & Body" },
];

// All expense items from your file - organized by category
const EXPENSE_ITEMS: Record<string, string[]> = {
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
    "Exhaust leak forward or below the gas",
  ],
  fuel_system: [
    "Visible fuel leak",
    "Fuel tank repairs",
    "Cooling system",
  ],
  spring_suspension: [
    "Cracked, loose or missing U bolt or other spring to axle clamp",
    "Any broken main leaf in the leaf spring",
    "Any displaced leaf that could result in contact with tire",
    "Broken or missing shocks",
    "Missing or broken axle bolts",
    "Drain drum, gear box and axle, flush and refill with proper lubricants",
    "Oil, brake fluid, shock absorber",
    "Steering joints, U bolts and chassis bolts to torque specifications",
    "Lubricate rear axle bearing. Tighten rear axle shaft nuts",
    "Check wheel alignment",
    "Tyre replacements",
    "Excessive free play",
    "Worn or faulty universal joints",
    "Steering wheel not properly secured",
    "Loose tire rod ends",
  ],
  auto_electricals: [
    "Visuals cracks or distortion that impair or inoperative",
    "Both brake lights missing or inoperative",
    "Both taillights missing or inoperative",
    "Any turn signal missing or inoperative",
    "Inoperative siren",
    "Emergency lighting not visible from all sides",
    "Aim headlights",
    "Battery, clean and tighten terminals",
    "Operation of all instruments, lights horns and accessories",
    "Adjust fan belt tension",
    "Coolant leak at water pump",
    "Any major coolant leak",
    "Automatic transmission overheating",
    "Defective clutch components",
    "Defective foot throttle",
    "Defective charging system",
    "Any major alternator, starter",
  ],
  engine_gearbox: [
    "Engine overhaul",
    "New Engine",
    "New gear box",
    "Engine coolant in motor oil",
    "Tune engine, including adjustment tappets",
    "Adjust ignition timing",
  ],
  cab_body: [
    "Missing or broken mirrors",
    "Defective doors",
    "Operation of body hardware, doors, glasses, locks and keys",
  ],
};

// Helper to get estimated cost range for display
const getCostHint = (itemName: string): string => {
  if (itemName.includes("Engine overhaul") || itemName.includes("New Engine") || itemName.includes("New gear box")) {
    return "Estimated: $2,000 - $8,000";
  }
  if (itemName.includes("transmission overheating") || itemName.includes("Engine coolant in motor oil")) {
    return "Estimated: $500 - $1,500";
  }
  if (itemName.includes("Cracked brake drums") || itemName.includes("Master cylinder leakage")) {
    return "Estimated: $250 - $600";
  }
  if (itemName.includes("Tyre replacements")) {
    return "Estimated: $300 - $800";
  }
  if (itemName.includes("alternator") || itemName.includes("starter")) {
    return "Estimated: $250 - $700";
  }
  if (itemName.includes("Oil") || itemName.includes("fluid") || itemName.includes("lubricants")) {
    return "Estimated: $50 - $200";
  }
  if (itemName.includes("inspection") || itemName.includes("check") || itemName.includes("adjust")) {
    return "Estimated: $40 - $150";
  }
  return "Estimated: $100 - $400";
};

interface ExpenseFormData {
  license_plate: string;
  amount: number;
  date: string;
  expense_item: string;
  expense_category: string;
  description?: string;
  jobTrip?: string;
  notes?: string;
}

interface Expense {
  _id?: string;
  license_plate: string;
  amount: number;
  date: Date;
  expense_item?: string;
  expense_category?: string;
  description?: string;
  jobTrip?: string;
  notes?: string;
}

interface ExpenseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
  refresh: () => void;
  expense?: Expense;
  vehicleLicensePlate: string;
}

const ExpenseForm = ({
  open,
  onOpenChange,
  onClose,
  refresh,
  expense,
  vehicleLicensePlate,
}: ExpenseFormProps) => {
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("braking_system");
  const [selectedItem, setSelectedItem] = useState("");
  const [customItem, setCustomItem] = useState("");
  const [useCustomItem, setUseCustomItem] = useState(false);
  
  const [formData, setFormData] = useState<ExpenseFormData>({
    license_plate: vehicleLicensePlate,
    amount: 0,
    date: new Date().toISOString().split("T")[0],
    expense_item: "",
    expense_category: "",
    description: "",
    jobTrip: "",
    notes: "",
  });

  // Available items based on selected category
  const availableItems = EXPENSE_ITEMS[selectedCategory] || [];

  useEffect(() => {
    if (expense) {
      // If editing, try to find the category for the existing item
      let foundCategory = "";
      let foundItem = (expense as any).expense_item || "";
      
      // Find which category contains this item
      for (const [cat, items] of Object.entries(EXPENSE_ITEMS)) {
        if (items.includes(foundItem)) {
          foundCategory = cat;
          break;
        }
      }
      
      setSelectedCategory(foundCategory || "braking_system");
      setSelectedItem(foundItem);
      setFormData({
        license_plate: vehicleLicensePlate,
        amount: expense.amount,
        date: expense.date instanceof Date
          ? expense.date.toISOString().split("T")[0]
          : new Date(expense.date).toISOString().split("T")[0],
        expense_item: foundItem,
        expense_category: foundCategory,
        description: expense.description || "",
        jobTrip: (expense as any).jobTrip || "",
        notes: expense.notes || "",
      });
    }
  }, [expense, vehicleLicensePlate]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setFormData({
        license_plate: vehicleLicensePlate,
        amount: 0,
        date: new Date().toISOString().split("T")[0],
        expense_item: "",
        expense_category: "",
        description: "",
        jobTrip: "",
        notes: "",
      });
      setSelectedCategory("braking_system");
      setSelectedItem("");
      setCustomItem("");
      setUseCustomItem(false);
    }
  }, [open, vehicleLicensePlate]);

  // Update form when selection changes
  useEffect(() => {
    if (!useCustomItem && selectedItem) {
      setFormData(prev => ({ 
        ...prev, 
        expense_item: selectedItem,
        expense_category: selectedCategory,
      }));
    } else if (useCustomItem) {
      setFormData(prev => ({ 
        ...prev, 
        expense_item: customItem,
        expense_category: selectedCategory,
      }));
    }
  }, [selectedItem, useCustomItem, customItem, selectedCategory]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "amount" ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.expense_item) {
      toast.error("Please select or enter an expense item");
      return;
    }
    
    if (formData.amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setLoading(true);

    try {
      const payload = expense?._id
        ? { 
            ...formData, 
            id: expense._id, 
            date: new Date(formData.date),
          }
        : { 
            ...formData, 
            date: new Date(formData.date),
          };

      const res = await fetch("/api/expenses", {
        method: expense?._id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to save expense");
      }

      toast.success(
        `Expense ${expense?._id ? "updated" : "added"} successfully!`
      );
      refresh();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save expense");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {expense ? "Edit Expense" : "Add Expense"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* License Plate (read-only) */}
          <div>
            <Label>License Plate</Label>
            <Input 
              value={vehicleLicensePlate} 
              readOnly 
              disabled 
              className="bg-muted" 
            />
          </div>

          {/* Expense Category */}
          <div>
            <Label>Expense Category *</Label>
            <Select
              value={selectedCategory}
              onValueChange={(value) => {
                setSelectedCategory(value);
                setSelectedItem("");
                setUseCustomItem(false);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Expense Item Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Expense Item *</Label>
              <button
                type="button"
                onClick={() => setUseCustomItem(!useCustomItem)}
                className="text-xs text-blue-600 hover:underline"
              >
                {useCustomItem ? "Use predefined item" : "Enter custom item"}
              </button>
            </div>
            
            {!useCustomItem ? (
              <Select value={selectedItem} onValueChange={setSelectedItem}>
                <SelectTrigger>
                  <SelectValue placeholder="Select expense item" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {availableItems.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={customItem}
                onChange={(e) => setCustomItem(e.target.value)}
                placeholder="Enter custom expense description"
              />
            )}
            
            {!useCustomItem && selectedItem && (
              <p className="text-xs text-muted-foreground mt-1">
                {getCostHint(selectedItem)}
              </p>
            )}
          </div>

          {/* Amount */}
          <div>
            <Label>Amount ($) *</Label>
            <Input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              value={formData.amount}
              onChange={handleChange}
              placeholder="0.00"
              required
            />
          </div>

          {/* Date */}
          <div>
            <Label>Date *</Label>
            <Input
              name="date"
              type="date"
              value={formData.date}
              onChange={handleChange}
              required
            />
          </div>

          {/* Description */}
          <div>
            <Label>Description</Label>
            <Input
              name="description"
              value={formData.description || ""}
              onChange={handleChange}
              placeholder="Brief expense description"
            />
          </div>

          {/* Job/Trip Reference */}
          <div>
            <Label>Job/Trip Reference</Label>
            <Input
              name="jobTrip"
              value={formData.jobTrip || ""}
              onChange={handleChange}
              placeholder="Associated job or trip number"
            />
          </div>

          {/* Notes */}
          <div>
            <Label>Notes</Label>
            <Textarea
              name="notes"
              value={formData.notes || ""}
              onChange={handleChange}
              placeholder="Additional notes, mechanic name, parts used..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : expense ? "Update Expense" : "Add Expense"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ExpenseForm;