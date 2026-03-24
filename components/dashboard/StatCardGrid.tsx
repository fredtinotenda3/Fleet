"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import StatCard from "./StatCard";

interface LiveStats {
  vehicles: number;
  fuelLogs: number;
  expenses: number;
  totalExpenses: number;
  remindersDue: number;
  meterLogs: number;
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1 },
  },
};

export default function StatCardGrid() {
  const [stats, setStats] = useState<LiveStats>({
    vehicles: 0,
    fuelLogs: 0,
    expenses: 0,
    totalExpenses: 0,
    remindersDue: 0,
    meterLogs: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchStats = async () => {
      try {
        const [vehiclesRes, fuelRes, expensesRes, remindersRes, meterRes] =
          await Promise.allSettled([
            fetch("/api/vehicles/stats", { signal: abortController.signal }),
            fetch("/api/fuellogs", { signal: abortController.signal }),
            fetch("/api/expenses", { signal: abortController.signal }),
            fetch("/api/reminders", { signal: abortController.signal }),
            fetch("/api/meterlogs", { signal: abortController.signal }),
          ]);

        const vehicleStats =
          vehiclesRes.status === "fulfilled" && vehiclesRes.value.ok
            ? await vehiclesRes.value.json()
            : { total: 0 };

        const fuelLogs =
          fuelRes.status === "fulfilled" && fuelRes.value.ok
            ? await fuelRes.value.json()
            : [];

        const expenses =
          expensesRes.status === "fulfilled" && expensesRes.value.ok
            ? await expensesRes.value.json()
            : [];

        const reminders =
          remindersRes.status === "fulfilled" && remindersRes.value.ok
            ? await remindersRes.value.json()
            : [];

        const meterLogs =
          meterRes.status === "fulfilled" && meterRes.value.ok
            ? await meterRes.value.json()
            : [];

        const totalExpenses = Array.isArray(expenses)
          ? expenses.reduce(
              (sum: number, e: { amount?: number }) => sum + (e.amount || 0),
              0
            )
          : 0;

        const remindersDue = Array.isArray(reminders)
          ? reminders.filter(
              (r: { status?: string }) =>
                r.status === "pending" || r.status === "overdue"
            ).length
          : 0;

        setStats({
          vehicles: vehicleStats.total ?? 0,
          fuelLogs: Array.isArray(fuelLogs) ? fuelLogs.length : 0,
          expenses: Array.isArray(expenses) ? expenses.length : 0,
          totalExpenses,
          remindersDue,
          meterLogs: Array.isArray(meterLogs) ? meterLogs.length : 0,
        });
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Failed to load dashboard stats:", err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    return () => abortController.abort();
  }, []);

  const cards = [
    { title: "Vehicles", value: loading ? "..." : stats.vehicles, href: "/vehicles" },
    { title: "Fuel", value: loading ? "..." : stats.fuelLogs, href: "/fuel" },
    { title: "Expenses", value: loading ? "..." : stats.expenses, href: "/expenses" },
    {
      title: "Total Expenses",
      value: loading ? "..." : `$${stats.totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      color: "text-red-500",
      href: "/expenses",
    },
    {
      title: "Reminders Due",
      value: loading ? "..." : stats.remindersDue,
      color: stats.remindersDue > 0 ? "text-yellow-500" : undefined,
      href: "/maintenance",
    },
    { title: "Meter Logs", value: loading ? "..." : stats.meterLogs, href: "/meter" },
  ];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      <AnimatePresence>
        {cards.map((stat, index) => (
          <motion.div
            key={stat.title}
            variants={{
              hidden: { opacity: 0, y: 10 },
              visible: { opacity: 1, y: 0 },
            }}
            transition={{ duration: 0.4 }}
          >
            <StatCard
              title={stat.title}
              value={stat.value}
              href={stat.href}
              color={stat.color}
              delay={index * 0.1}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
