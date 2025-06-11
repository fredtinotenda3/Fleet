"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface ExpenseType {
  _id: string;
  name: string;
  category: string;
}

interface ExpenseFormData {
  license_plate: string;
  amount: number;
  date: string; // keep as string for <input type="date">
  expense_type_id: string;
  description?: string;
  jobTrip?: string;
  notes?: string;
}

interface Expense {
  _id?: string;
  license_plate: string;
  amount: number;
  date: Date;
  expense_type_id: string;
  description?: string;
  jobTrip?: string;
  notes?: string;
}

interface ExpenseFormProps {
  closeModal: () => void;
  refresh: () => void;
  expense?: Expense;
  vehicleLicensePlate: string;
}

const ExpenseForm = ({
  closeModal,
  refresh,
  expense,
  vehicleLicensePlate,
}: ExpenseFormProps) => {
  const [formData, setFormData] = useState<ExpenseFormData>({
    license_plate: vehicleLicensePlate,
    amount: 0,
    date: new Date().toISOString().split("T")[0], // string YYYY-MM-DD
    expense_type_id: "",
    description: "",
    jobTrip: "",
    notes: "",
  });

  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchExpenseTypes = async () => {
      try {
        const res = await fetch("/api/expense-types");
        const data = await res.json();
        setExpenseTypes(data);
      } catch (error) {
        console.error("Failed to fetch expense types:", error);
      }
    };

    fetchExpenseTypes();

    if (expense) {
      setFormData({
        license_plate: vehicleLicensePlate,
        amount: expense.amount,
        // convert Date to YYYY-MM-DD string for input value
        date:
          expense.date instanceof Date
            ? expense.date.toISOString().split("T")[0]
            : new Date(expense.date).toISOString().split("T")[0],
        expense_type_id: expense.expense_type_id, // FIXED HERE
        description: expense.description || "",
        jobTrip: expense.jobTrip || "",
        notes: expense.notes || "",
      });
    }
  }, [expense, vehicleLicensePlate]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "amount" ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Convert date string to Date object here before sending
      const payload = expense?._id
        ? { ...formData, id: expense._id, date: new Date(formData.date) }
        : { ...formData, date: new Date(formData.date) };

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
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save expense");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="text-red-500 text-sm">{error}</div>}

      <div>
        <Label htmlFor="amount">Amount *</Label>
        <Input
          id="amount"
          name="amount"
          type="number"
          step="0.01"
          value={formData.amount}
          onChange={handleChange}
          required
        />
      </div>

      <div>
        <Label htmlFor="date">Date *</Label>
        <Input
          id="date"
          name="date"
          type="date"
          value={formData.date}
          onChange={handleChange}
          required
        />
      </div>

      <div>
        <Label htmlFor="expense_type_id">Expense Type *</Label>
        <select
          id="expense_type_id"
          name="expense_type_id"
          value={formData.expense_type_id}
          onChange={handleChange}
          className="w-full p-2 border rounded-md"
          required
        >
          <option value="">Select Expense Type</option>
          {expenseTypes.map((type) => (
            <option key={type._id} value={type._id}>
              {type.name} ({type.category})
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          name="description"
          value={formData.description || ""}
          onChange={handleChange}
          placeholder="Brief expense description"
        />
      </div>

      <div>
        <Label htmlFor="jobTrip">Job/Trip Reference</Label>
        <Input
          id="jobTrip"
          name="jobTrip"
          value={formData.jobTrip || ""}
          onChange={handleChange}
          placeholder="Associated job or trip"
        />
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Input
          id="notes"
          name="notes"
          value={formData.notes || ""}
          onChange={handleChange}
          placeholder="Additional notes"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : expense ? "Update" : "Add Expense"}
        </Button>
        <Button type="button" variant="outline" onClick={closeModal}>
          Cancel
        </Button>
      </div>
    </form>
  );
};

export default ExpenseForm;
