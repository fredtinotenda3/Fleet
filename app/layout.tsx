import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SessionWrapper from "./session-wrapper";
import { Toaster } from "@/components/ui/sonner";
// import Sidebar from "@/components/sidebar/Sidebar"; // Adjust this path if needed

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vehicle Expense & Fleet Management",
  description: "Created by Fred Tinotenda",
};

// Updated RootLayout snippet (remove padding from main content)
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SessionWrapper>
          <div className="flex h-screen w-screen overflow-hidden">
            <main className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-950">
              {children} {/* Removed padding here */}
            </main>
          </div>
        </SessionWrapper>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
