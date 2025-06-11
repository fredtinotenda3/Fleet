"use client";

import { AnimatePresence, motion } from "framer-motion";
import StatCard from "./StatCard";

const stats = [
  { title: "Vehicles", value: 12, href: "/vehicles" },
  { title: "Fuel Logs", value: 42, href: "/fuel" },
  { title: "Expenses", value: 18, href: "/expenses" },
  {
    title: "Total Expenses",
    value: "$8,540",
    color: "text-red-500",
    href: "/expenses",
  },
  {
    title: "Reminders Due",
    value: 3,
    color: "text-yellow-500",
    href: "/reminders",
  },
  { title: "Meter Logs", value: 24, href: "/meter-logs" },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export default function StatCardGrid() {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      <AnimatePresence>
        {stats.map((stat, index) => (
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
