/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Expense, Vehicle } from "@/types";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import ExpenseForm from "../forms/ExpenseForm";
import { ExpenseTable } from "./expenses/ExpenseTable";
import { ExpenseStats } from "./expenses/ExpenseStats";
import { ExpenseCharts } from "./expenses/ExpenseCharts";
import { format } from "date-fns";

export default function ExpenseSection({ vehicle }: { vehicle: Vehicle }) {
  const { theme } = useTheme();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | undefined>();
  const [chartData, setChartData] = useState<{
    typeData: { name: string; value: number }[];
    timeData: { date: string; amount: number }[];
    monthlyTrends: { date: string; amount: number }[];
    topCategories: { name: string; value: number }[];
  }>({
    typeData: [],
    timeData: [],
    monthlyTrends: [],
    topCategories: [],
  });
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/expenses?license_plate=${vehicle.license_plate}&includeNonDeletedVehicles=true`
      );
      const data = await res.json();
      setExpenses(data);

      const typeMap = new Map<string, number>();
      const dateMap = new Map<string, number>();
      const monthMap = new Map<string, number>();

      data.forEach((expense: Expense) => {
        const typeName = expense.expense_type?.name || "Other";
        const date = new Date(expense.date);
        const monthKey = format(date, "MMM yyyy");

        typeMap.set(typeName, (typeMap.get(typeName) || 0) + expense.amount);

        const dateKey = format(date, "MMM dd");
        dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + expense.amount);

        monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + expense.amount);
      });

      const sortedCategories = Array.from(typeMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, value]) => ({ name, value }));

      setChartData({
        typeData: Array.from(typeMap, ([name, value]) => ({ name, value })),
        timeData: Array.from(dateMap, ([date, amount]) => ({
          date,
          amount,
        })).sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        ),
        monthlyTrends: Array.from(monthMap, ([date, amount]) => ({
          date,
          amount,
        })).sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        ),
        topCategories: sortedCategories,
      });
    } catch (error) {
      toast.error("Failed to fetch expenses.");
    } finally {
      setLoading(false);
    }
  }, [vehicle.license_plate]);

  const handleDelete = (id: string) => {
    toast("Are you sure you want to delete this expense?", {
      action: {
        label: "Confirm",
        onClick: async () => {
          try {
            const res = await fetch(`/api/expenses/${id}`, {
              method: "DELETE",
            });
            if (!res.ok) throw new Error();

            toast.success("Expense deleted");
            fetchExpenses();
          } catch {
            toast.error("Failed to delete expense.");
          }
        },
      },
      cancel: {
        label: "Cancel",
        onClick: () => {},
      },
      duration: 10000,
    });
  };

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const colors = useMemo(
    () =>
      theme === "dark"
        ? ["#2563eb", "#16a34a", "#dc2626", "#d97706", "#9333ea", "#0ea5e9"]
        : ["#60a5fa", "#4ade80", "#f87171", "#fb923c", "#c084fc", "#38bdf8"],
    [theme]
  );

  const filteredExpenses = useMemo(
    () =>
      selectedCategory
        ? expenses.filter((exp) => exp.expense_type?.name === selectedCategory)
        : expenses,
    [expenses, selectedCategory]
  );

  const totalExpense = useMemo(
    () => filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0),
    [filteredExpenses]
  );

  const uniqueDates = useMemo(
    () =>
      Array.from(
        new Set(filteredExpenses.map((e) => new Date(e.date).toDateString()))
      ),
    [filteredExpenses]
  );

  const averageDailyExpense = useMemo(
    () => (uniqueDates.length > 0 ? totalExpense / uniqueDates.length : 0),
    [totalExpense, uniqueDates]
  );

  const averageMonthlyExpense = useMemo(() => {
    const months = new Set(
      filteredExpenses.map(
        (e) =>
          `${new Date(e.date).getFullYear()}-${new Date(e.date).getMonth()}`
      )
    );
    return months.size > 0 ? totalExpense / months.size : 0;
  }, [filteredExpenses, totalExpense]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold tracking-tight">Expense Management</h3>
        <Button
          onClick={() => {
            setEditingExpense(undefined);
            setShowForm(true);
          }}
        >
          Add Expense
        </Button>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingExpense ? "Edit Expense" : "Add Expense"}
            </DialogTitle>
          </DialogHeader>
          <ExpenseForm
            vehicleLicensePlate={vehicle.license_plate}
            refresh={fetchExpenses}
            closeModal={() => setShowForm(false)}
            expense={editingExpense}
          />
        </DialogContent>
      </Dialog>
      <ExpenseStats
        totalExpense={totalExpense}
        averageDailyExpense={averageDailyExpense}
        averageMonthlyExpense={averageMonthlyExpense}
      />

      <ExpenseCharts
        typeData={chartData.typeData}
        timeData={chartData.timeData}
        monthlyTrends={chartData.monthlyTrends}
        topCategories={chartData.topCategories}
        colors={colors}
        onCategorySelect={(category) =>
          setSelectedCategory((prev) => (prev === category ? null : category))
        }
      />
      <ExpenseTable
        expenses={filteredExpenses}
        loading={loading}
        onEdit={(expense) => {
          setEditingExpense(expense);
          setShowForm(true);
        }}
        onDelete={handleDelete}
      />
    </div>
  );
}
