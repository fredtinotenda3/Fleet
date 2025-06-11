// app/(protected)/layout.tsx
import { ReactNode } from "react";
import Sidebar from "@/components/sidebar/Sidebar";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
