import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Super admin has access to everything
    const userRoles = (token as any).roles || [];
    if (userRoles.includes("super_admin") || userRoles.includes("organization_owner")) {
      return NextResponse.next();
    }

    // Role-based path restrictions
    const isAdminPath = path.startsWith("/admin");
    if (isAdminPath && !userRoles.includes("fleet_manager")) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

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
     * Match all paths EXCEPT:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, images
     * - /auth/* (login, register pages)
     * - /api/auth/* (NextAuth endpoints)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.png$|auth/|api/auth/).*)",
  ],
};