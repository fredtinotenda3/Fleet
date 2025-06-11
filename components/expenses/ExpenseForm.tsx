/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "react-toastify";

interface ExpenseType {
  _id: string;
  name: string;
  category: string;
}

interface Expense {
  _id?: string;
  license_plate: string;
  amount: number;
  date: string;
  expense_type_id: string;
  description?: string;
  jobTrip?: string;
  notes?: string;
}

interface ExpenseFormProps {
  closeModal: () => void;
  refresh: () => void;
  expense?: any;
}

const ExpenseForm = ({ closeModal, refresh, expense }: ExpenseFormProps) => {
  const [formData, setFormData] = useState<Expense>({
    license_plate: "",
    amount: 0,
    date: new Date().toISOString().split("T")[0],
    expense_type_id: "",
    description: "",
    jobTrip: "",
    notes: "",
  });

  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [licensePlates, setLicensePlates] = useState<string[]>([]);
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

    const fetchLicensePlates = async () => {
      try {
        const res = await fetch("/api/vehicles");
        const data = await res.json();
        const plates = data.map((v: any) => v.license_plate);
        setLicensePlates(plates);
      } catch (error) {
        console.error("Failed to fetch license plates:", error);
      }
    };

    fetchExpenseTypes();
    fetchLicensePlates();

    if (expense) {
      setFormData({
        ...expense,
        expense_type_id:
          typeof expense.expense_type === "object"
            ? expense.expense_type._id
            : expense.expense_type,
      });
    }
  }, [expense]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "amount" ? Number(value) : value,
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const payload = expense?._id
        ? { ...formData, id: expense._id }
        : formData;

      const res = await fetch("/api/expenses", {
        method: expense?._id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (res.ok) {
        toast.success(
          `Expense ${expense?._id ? "updated" : "added"} successfully!`
        );
        refresh();
        closeModal();
      } else {
        setError(result.error || "Something went wrong.");
      }
    } catch (err) {
      setError("Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      {error && <div className="text-red-500 text-sm font-medium">{error}</div>}

      <div>
        <Label htmlFor="license_plate">License Plate</Label>
        <select
          id="license_plate"
          name="license_plate"
          value={formData.license_plate}
          onChange={handleChange}
          className="w-full p-2 border rounded-md"
          required
        >
          <option value="">Select License Plate</option>
          {licensePlates.map((plate) => (
            <option key={plate} value={plate}>
              {plate}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="amount">Amount</Label>
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
        <Label htmlFor="date">Date</Label>
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
        <Label htmlFor="expense_type_id">Expense Type</Label>
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
          placeholder="Optional description"
        />
      </div>

      <div>
        <Label htmlFor="jobTrip">Job/Trip</Label>
        <Input
          id="jobTrip"
          name="jobTrip"
          value={formData.jobTrip || ""}
          onChange={handleChange}
          placeholder="Optional job/trip reference"
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
          {expense ? "Update" : "Add"}
        </Button>
        <Button type="button" variant="outline" onClick={closeModal}>
          Cancel
        </Button>
      </div>
    </form>
  );
};

export default ExpenseForm;
