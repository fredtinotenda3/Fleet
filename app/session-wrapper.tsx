"use client";

import { SessionProvider } from "next-auth/react";

// FIX: NextAuth's SessionProvider defaults to refetchOnWindowFocus=true,
// which fires a GET /api/auth/session every time you alt-tab back into the
// browser or click between VS Code and the browser during dev. That's a
// big chunk of the repeated "GET /api/auth/session 200 in ...ms" lines in
// your log. Turning it off (and leaving refetchInterval at 0/off) means
// the session is fetched once on load and revalidated by React Query /
// your own hooks instead of NextAuth's own polling layer.
export default function SessionWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      {children}
    </SessionProvider>
  );
}