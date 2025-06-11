"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  const links = [
    { href: "/dashboard", icon: "🏠", label: "Dashboard" },
    { href: "/vehicles", icon: "🚙", label: "Vehicles" },
    { href: "/details", icon: "📋", label: "Vehicle Details" },
    { href: "/expenses", icon: "💸", label: "Expenses" },
    { href: "/fuel", icon: "⛽", label: "FuelLogs" },
    { href: "/meter", icon: "📏", label: "MeterLogs" },
    { href: "/maintenance", icon: "🛠️", label: "Maintenance" }, // Added maintenance link
  ];

  return (
    <aside
      className={`bg-[#1f2937] text-white h-screen p-4 flex flex-col transition-all duration-300 ease-in-out ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="text-xl font-semibold">
            {collapsed ? "🚗" : "🚗 StanleyVerse"}
          </span>
        </div>
        <button
          onClick={() => setCollapsed((prev) => !prev)}
          className="text-white hover:text-gray-300"
          aria-label="Toggle Sidebar"
        >
          {collapsed ? <Menu size={24} /> : <X size={24} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-2">
        {links.map((link) => (
          <SidebarLink
            key={link.href}
            href={link.href}
            icon={link.icon}
            label={link.label}
            collapsed={collapsed}
            active={pathname.startsWith(link.href)} // Fixed active check to startsWith
          />
        ))}
      </nav>
    </aside>
  );
}

type SidebarLinkProps = {
  href: string;
  icon: string;
  label: string;
  collapsed: boolean;
  active: boolean;
};

function SidebarLink({
  href,
  icon,
  label,
  collapsed,
  active,
}: SidebarLinkProps) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 ease-in-out
        ${
          active
            ? "bg-gray-700 text-white"
            : "text-gray-300 hover:bg-gray-700 hover:text-white"
        }`}
    >
      <span className="text-lg">{icon}</span>
      {!collapsed && (
        <span className="whitespace-nowrap transition-all duration-300 ease-in-out">
          {label}
        </span>
      )}
    </Link>
  );
}
