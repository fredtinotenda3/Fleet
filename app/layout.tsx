// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css"; 
import SessionWrapper from "./session-wrapper";
import { Toaster } from "@/frontend/shared/ui/sonner";
import { ThemeProvider } from "next-themes";
import { QueryProvider } from './providers/QueryProvider';
import { ServiceWorkerRegister } from "@/frontend/shared/pwa/ServiceWorkerRegister";
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
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fleet Driver",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0f14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <QueryProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <SessionWrapper>
              <div className="flex w-screen h-screen overflow-hidden">
                <main className="flex-1 overflow-auto bg-background">
                  {children}
                </main>
              </div>
            </SessionWrapper>
            <Toaster position="top-right" richColors />
            <ServiceWorkerRegister />
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
