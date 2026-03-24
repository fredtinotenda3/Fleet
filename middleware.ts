import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/auth/login",
    },
  }
);

export const config = {
  matcher: [
    /*
     * Protect all routes EXCEPT:
     * - /auth/login
     * - /auth/register
     * - /api/auth (NextAuth internal routes)
     * - /api/admin/register (allow new account creation)
     * - /_next (Next.js internals)
     * - /favicon.ico, /public assets
     */
    "/((?!auth/login|auth/register|api/auth|api/admin/register|_next/static|_next/image|favicon.ico).*)",
  ],
};