/* eslint-disable @typescript-eslint/no-unused-vars */
// components/expenses/ExpenseCard.tsx

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ExpenseForm from "./ExpenseForm";
import { toast } from "react-toastify";

interface ExpenseType {
  _id: string;
  name: string;
  category: string;
  description: string;
}

interface Expense {
  _id?: string;
  license_plate: string;
  amount: number;
  date: string;
  expense_type: ExpenseType | string;
  description: string;
  jobTrip?: string;
  notes?: string;
}

interface Props {
  expense: Expense;
  refresh: () => void;
}

const ExpenseCard = ({ expense, refresh }: Props) => {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "DELETE",
        body: JSON.stringify({ id: expense._id }),
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        toast.success("Expense deleted successfully!");
        refresh();
        setDeleteOpen(false);
      } else {
        toast.error("Failed to delete expense.");
      }
    } catch (err) {
      toast.error("Error deleting expense.");
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (date: string) => {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    };
    return new Date(date).toLocaleDateString("en-US", options);
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
      <h3 className="text-xl font-bold">
        ${expense.amount.toFixed(2)}
        <span className="text-sm font-normal ml-2">
          -{" "}
          {typeof expense.expense_type === "object"
            ? expense.expense_type.name
            : expense.expense_type}
        </span>
      </h3>

      <div className="text-sm text-muted-foreground mt-2">
        <p>
          License Plate: <strong>{expense.license_plate}</strong>
        </p>
        <p>
          Date: <strong>{formatDate(expense.date)}</strong>
        </p>
        {expense.description && (
          <p>
            Description: <strong>{expense.description}</strong>
          </p>
        )}
        {expense.jobTrip && (
          <p>
            Job Trip: <strong>{expense.jobTrip}</strong>
          </p>
        )}
        {expense.notes && (
          <p>
            Notes: <strong>{expense.notes}</strong>
          </p>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <Button onClick={() => setEditOpen(true)} size="sm">
          Edit
        </Button>
        <Button
          variant="destructive"
          onClick={() => setDeleteOpen(true)}
          size="sm"
        >
          Delete
        </Button>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Expense</DialogTitle>
          </DialogHeader>
          <ExpenseForm
            expense={expense}
            closeModal={() => setEditOpen(false)}
            refresh={refresh}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Are you sure you want to delete this expense?
            </DialogTitle>
          </DialogHeader>
          <div className="flex justify-between mt-4">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Yes, Delete"}
            </Button>
            <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExpenseCard;
