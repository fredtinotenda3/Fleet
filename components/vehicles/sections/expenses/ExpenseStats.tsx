import { DollarSign, CalendarDays, CalendarCheck2 } from "lucide-react";

interface ExpenseStatsProps {
  totalExpense: number;
  averageDailyExpense: number;
  averageMonthlyExpense: number;
}

export function ExpenseStats({
  totalExpense,
  averageDailyExpense,
  averageMonthlyExpense,
}: ExpenseStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
      <StatCard
        icon={<DollarSign className="w-5 h-5 text-green-500" />}
        title="Total Expense"
        value={`$${totalExpense.toFixed(2)}`}
        valueColor="text-green-600"
      />
      <StatCard
        icon={<CalendarDays className="w-5 h-5 text-blue-500" />}
        title="Average Daily Expense"
        value={`$${averageDailyExpense.toFixed(2)}`}
        valueColor="text-blue-600"
      />
      <StatCard
        icon={<CalendarCheck2 className="w-5 h-5 text-purple-500" />}
        title="Average Monthly Expense"
        value={`$${averageMonthlyExpense.toFixed(2)}`}
        valueColor="text-purple-600"
      />
    </div>
  );
}

type StatCardProps = {
  icon: React.ReactNode;
  title: string;
  value: string;
  valueColor: string;
};

function StatCard({ icon, title, value, valueColor }: StatCardProps) {
  return (
    <div className="border rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow bg-white dark:bg-gray-900">
      <div className="flex items-center gap-3 mb-2">
        {icon}
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <div className={`text-xl font-bold ${valueColor}`}>{value}</div>
    </div>
  );
}
