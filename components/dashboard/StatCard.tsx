"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ReactNode } from "react";
import { Car, Fuel, Wallet, Bell, Gauge, CircleDollarSign } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  color?: string;
  href?: string;
  delay?: number; // ✅ added delay prop
}

const getIcon = (title: string): ReactNode => {
  switch (title) {
    case "Vehicles":
      return <Car className="w-6 h-6 text-gray-400" />;
    case "Fuel":
      return <Fuel className="w-6 h-6 text-gray-400" />;
    case "Expenses":
      return <Wallet className="w-6 h-6 text-gray-400" />;
    case "Total Expenses":
      return <CircleDollarSign className="w-6 h-6 text-gray-400" />;
    case "Reminders Due":
      return <Bell className="w-6 h-6 text-gray-400" />;
    case "Meter Logs":
      return <Gauge className="w-6 h-6 text-gray-400" />;
    default:
      return null;
  }
};

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  color = "",
  href,
  delay = 0, // ✅ default delay to 0
}) => {
  const content = (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }} // ✅ apply animation delay
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      className={`rounded-2xl shadow-md border border-gray-200 p-5 bg-white transition duration-300 ${
        href ? "hover:shadow-lg cursor-pointer" : "cursor-default"
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <h2 className={`text-2xl font-bold mt-1 ${color}`}>{value}</h2>
        </div>
        <div className="opacity-70">{getIcon(title)}</div>
      </div>
    </motion.div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
};

export default StatCard;
