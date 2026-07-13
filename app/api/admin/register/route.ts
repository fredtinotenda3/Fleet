// app/api/admin/register/route.ts
//
// FIX (🔴 Critical -- silent platform-wide access grant on every new
// account): insertOne() never stamped a tenantId on the created
// tbladmin row. lib/authOptions.ts's authorize() resolves a missing
// tenantId as `user.tenantId || AUTH_TENANT_ID` ('default'), and
// 'default' is the sentinel every repository treats as "skip tenant
// filtering, return everything." Every account created through this
// endpoint -- regardless of which organization's owner created it --
// logged in with silent cross-tenant visibility into every other
// organization's data. Fixed by stamping the creating caller's own
// tenantId (or, for a literal platform SUPER_ADMIN, an optional
// explicit tenantId in the body) onto the new row, and by allowing an
// explicit Role to be assigned (gated so only a platform SUPER_ADMIN
// can provision another super_admin -- otherwise identical
// privilege-escalation risk to the admin/update bug above).
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import bcrypt from "bcryptjs";
import { getAuthContext } from "@/server/auth/auth-context";
import { Role } from "@/server/permissions/roles";

const ASSIGNABLE_ROLES = new Set<string>(Object.values(Role));

export async function POST(request: NextRequest) {
  const context = await getAuthContext(request);
  if (!context) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }
  if (!context.isSuperAdmin) {
    return NextResponse.json(
      { message: "You do not have permission to create admin accounts" },
      { status: 403 }
    );
  }

  const isPlatformSuperAdmin = context.roles.includes(Role.SUPER_ADMIN);
  const body = await request.json();
  const { firstName, email, password, role, tenantId: requestedTenantId } = body;

  if (!firstName || !email || !password) {
    return NextResponse.json({ message: "All fields are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { message: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  // Organization owners can only provision accounts inside their own
  // tenant. A literal platform SUPER_ADMIN may target another tenant
  // explicitly (e.g. platform support provisioning for a customer);
  // everyone else is pinned to their own tenant regardless of body input.
  const tenantId = isPlatformSuperAdmin && requestedTenantId ? requestedTenantId : context.tenantId;

  let assignedRole: string = Role.VIEWER;
  if (typeof role === "string" && ASSIGNABLE_ROLES.has(role)) {
    if (role === Role.SUPER_ADMIN && !isPlatformSuperAdmin) {
      return NextResponse.json(
        { message: "Only a platform super admin may create another super admin" },
        { status: 403 }
      );
    }
    assignedRole = role;
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
          message: existingUser.Email === email ? "Email already registered" : "Name already taken",
        },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await admins.insertOne({
      FirstName: firstName,
      Email: email,
      Password: hashedPassword,
      Role: assignedRole,
      tenantId,
      createdAt: new Date(),
    });

    if (result.insertedId) {
      return NextResponse.json({ message: "User registered successfully" }, { status: 201 });
    }
    return NextResponse.json({ message: "Failed to create user" }, { status: 500 });
  } catch (err) {
    console.error("Registration error:", err);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}