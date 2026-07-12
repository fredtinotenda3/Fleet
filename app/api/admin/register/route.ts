import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import bcrypt from "bcryptjs";
import { requireAuth } from "@/lib/requireAuth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

// FIX (🔴 Critical): this route had NO authentication and NO
// authorization check. Any unauthenticated request could create a new
// row in tbladmin — i.e. anyone on the internet could self-provision
// an admin account with a password of their choosing. requireAuth()
// closes the anonymous-access hole; the additional isSuperAdmin check
// below closes the privilege-escalation hole (an ordinary authenticated
// user still shouldn't be able to mint new admins).
//
// NOTE: `roles` on the session token is populated by lib/authOptions.ts
// during login (see app/api/auth/[...nextauth]/route.ts comments) and
// mirrors modules/security's Role enum. This checks the same
// super_admin / organization_owner roles that middleware.ts already
// treats as the "admin surface" gate for /admin/* pages, so this route
// is at least as strict as page-level access.
export async function POST(request: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.user as { roles?: string[] } | undefined)?.roles ?? [];
  const isSuperAdmin = roles.includes("super_admin") || roles.includes("organization_owner");

  if (!isSuperAdmin) {
    return NextResponse.json(
      { message: "You do not have permission to create admin accounts" },
      { status: 403 }
    );
  }

  const { firstName, email, password } = await request.json();

  if (!firstName || !email || !password) {
    return NextResponse.json(
      { message: "All fields are required" },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { message: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  try {
    const db = await connectToDatabase();
    const admins = db.collection("tbladmin");

    const existingUser = await admins.findOne({
      $or: [{ Email: email }, { FirstName: firstName }],
    });

    if (existingUser) {
      return NextResponse.json(
        {
          message:
            existingUser.Email === email
              ? "Email already registered"
              : "Name already taken",
        },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await admins.insertOne({
      FirstName: firstName,
      Email: email,
      Password: hashedPassword,
      createdAt: new Date(),
    });

    if (result.insertedId) {
      return NextResponse.json(
        { message: "User registered successfully" },
        { status: 201 }
      );
    } else {
      return NextResponse.json(
        { message: "Failed to create user" },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("Registration error:", err);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}