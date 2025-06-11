// components/expenses/ExpenseList.tsx

"use client";

import ExpenseCard from "./ExpenseCard";

interface Expense {
  _id?: string;
  license_plate: string;
  amount: number;
  date: string;
  expense_type: {
    _id: string;
    name: string;
    category: string;
    description: string;
  };
  description: string;
  jobTrip?: string;
  notes?: string;
}

interface Props {
  expenses: Expense[];
  refresh: () => void;
}

const ExpenseList = ({ expenses, refresh }: Props) => {
  if (!expenses.length) {
    return <p className="text-muted-foreground">No expenses available.</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {expenses.map((expense) => (
        <ExpenseCard key={expense._id} expense={expense} refresh={refresh} />
      ))}
    </div>
  );
};

export default ExpenseList;
