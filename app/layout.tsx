// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css"; 
import SessionWrapper from "./session-wrapper";
import { Toaster } from "@/frontend/shared/ui/sonner";
import { ThemeProvider } from "next-themes";
import { QueryProvider } from './providers/QueryProvider';
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <QueryProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <SessionWrapper>
              <div className="flex w-screen h-screen overflow-hidden">
                <main className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-950">
                  {children}
                </main>
              </div>
            </SessionWrapper>
            <Toaster position="top-right" richColors />
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
