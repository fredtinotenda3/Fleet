/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useCallback, useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { Expense } from "@/types";
import {
  DollarSign,
  CalendarDays,
  CalendarCheck2,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface ExpenseStatsProps {
  totalExpense: number;
  averageDailyExpense: number;
  averageMonthlyExpense: number;
  trendPercentage: number;
}

interface ExpenseChartData {
  typeData: { name: string; value: number }[];
  topCategories: { name: string; value: number }[];
  monthlyTrends: { date: string; amount: number }[];
}

const CARD_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#f59e0b"];
const CHART_COLORS = ["#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6"];

export default function FleetExpensesSummary() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<ExpenseChartData>({
    typeData: [],
    topCategories: [],
    monthlyTrends: [],
  });

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/expenses`);
      const data = await res.json();
      setExpenses(data);

      const typeMap = new Map<string, number>();
      const monthMap = new Map<string, number>();

      data.forEach((expense: Expense) => {
        const typeName = expense.expense_type?.name || "Other";
        const date = new Date(expense.date);
        const monthKey = date.toLocaleString("default", {
          month: "short",
          year: "numeric",
        });

        typeMap.set(typeName, (typeMap.get(typeName) || 0) + expense.amount);
        monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + expense.amount);
      });

      const sortedCategories = Array.from(typeMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, value]) => ({ name, value }));

      setChartData({
        typeData: Array.from(typeMap, ([name, value]) => ({ name, value })),
        topCategories: sortedCategories,
        monthlyTrends: Array.from(monthMap, ([date, amount]) => ({
          date,
          amount,
        })),
      });
    } catch (error) {
      toast.error("Failed to fetch fleet expenses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const stats = useMemo<ExpenseStatsProps>(() => {
    if (expenses.length === 0) {
      return {
        totalExpense: 0,
        averageDailyExpense: 0,
        averageMonthlyExpense: 0,
        trendPercentage: 0,
      };
    }

    const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);

    const uniqueDates = Array.from(
      new Set(expenses.map((e) => new Date(e.date).toDateString()))
    ).length;

    const dailyAvg = uniqueDates > 0 ? total / uniqueDates : 0;

    const months = new Set(
      expenses.map(
        (e) =>
          `${new Date(e.date).getFullYear()}-${new Date(e.date).getMonth()}`
      )
    ).size;

    const monthlyAvg = months > 0 ? total / months : 0;

    const now = new Date();
    const currentMonth = now.toLocaleString("default", {
      month: "short",
      year: "numeric",
    });
    const lastMonth = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1
    ).toLocaleString("default", { month: "short", year: "numeric" });

    const currentMonthTotal =
      chartData.monthlyTrends.find((m) => m.date === currentMonth)?.amount || 0;
    const lastMonthTotal =
      chartData.monthlyTrends.find((m) => m.date === lastMonth)?.amount || 0;

    const trendPercentage =
      lastMonthTotal > 0
        ? Math.round(
            ((currentMonthTotal - lastMonthTotal) / lastMonthTotal) * 100
          )
        : currentMonthTotal > 0
        ? 100
        : 0;

    return {
      totalExpense: total,
      averageDailyExpense: dailyAvg,
      averageMonthlyExpense: monthlyAvg,
      trendPercentage,
    };
  }, [expenses, chartData.monthlyTrends]);

  const StatCard = ({
    icon,
    title,
    value,
    description,
    color,
    loading,
  }: {
    icon: React.ReactNode;
    title: string;
    value: string;
    description?: string;
    color: string;
    loading: boolean;
  }) => (
    <article className="bg-background rounded-lg border hover:shadow-md transition-shadow">
      <div className="p-4 flex items-center gap-4">
        <div className="p-2 rounded-lg bg-muted">{icon}</div>
        <div className="space-y-1 min-w-[120px]">
          <h3 className="text-sm text-muted-foreground">{title}</h3>
          {loading ? (
            <Skeleton className="h-6 w-32" />
          ) : (
            <>
              <div className="text-xl font-semibold">{value}</div>
              {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background p-3 border rounded-md shadow-sm">
          <p className="font-semibold">{label}</p>
          <p className="text-sm">${payload[0].value.toFixed(2)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-muted/50 rounded-xl p-4">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-blue-600" />
        StanleyVerse Fleet Expenses Summary
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<DollarSign className="w-5 h-5 text-blue-500" />}
          title="Total Expenses"
          value={`$${stats.totalExpense.toLocaleString()}`}
          color={CARD_COLORS[0]}
          loading={loading}
        />
        <StatCard
          icon={<CalendarDays className="w-5 h-5 text-green-500" />}
          title="Daily Average"
          value={`$${stats.averageDailyExpense.toFixed(2)}`}
          color={CARD_COLORS[1]}
          loading={loading}
        />
        <StatCard
          icon={<CalendarCheck2 className="w-5 h-5 text-red-500" />}
          title="Monthly Average"
          value={`$${stats.averageMonthlyExpense.toLocaleString()}`}
          color={CARD_COLORS[2]}
          loading={loading}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5 text-orange-500" />}
          title="Monthly Trend"
          value={`${stats.trendPercentage >= 0 ? "+" : ""}${
            stats.trendPercentage
          }%`}
          description="vs previous month"
          color={CARD_COLORS[3]}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-background">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Top Expense Categories
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Skeleton className="w-32 h-32 rounded-full" />
              </div>
            ) : chartData.topCategories.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData.topCategories}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    label={({ name, percent }) =>
                      `${name}: ${(percent * 100).toFixed(0)}%`
                    }
                  >
                    {chartData.topCategories.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`$${value}`, "Amount"]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                No expense data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-background">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Monthly Expense Trends
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Skeleton className="w-full h-40" />
              </div>
            ) : chartData.monthlyTrends.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.monthlyTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="amount" fill="#3b82f6" name="Monthly Total" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                No trend data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
