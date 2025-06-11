"use client";

import { motion } from "framer-motion";

const StatCardSkeleton = () => {
  return (
    <motion.div
      className="rounded-2xl shadow-md border border-gray-200 p-5 bg-white animate-pulse"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="h-4 bg-gray-300 rounded w-24 mb-2" />
          <div className="h-6 bg-gray-300 rounded w-20" />
        </div>
        <div className="w-6 h-6 bg-gray-300 rounded-full" />
      </div>
    </motion.div>
  );
};

export default StatCardSkeleton;
