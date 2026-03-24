"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch — only render after mount
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex items-center gap-3 px-3 py-2 rounded-md w-full
        text-gray-300 hover:bg-gray-700 hover:text-white
        transition-all duration-200"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <Sun size={20} className="shrink-0" />
      ) : (
        <Moon size={20} className="shrink-0" />
      )}
      <span className="whitespace-nowrap">
        {isDark ? "Light mode" : "Dark mode"}
      </span>
    </button>
  );
}
