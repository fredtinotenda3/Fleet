// app/api/admin/update/route.ts
//
// FIX (🔴 Critical -- privilege escalation + cross-tenant account takeover):
// this route previously only called requireAuth() (proves *a* session
// exists) with NO role check and NO tenant scoping, and did a raw
// `$set: updateData` with the entire request body. Concretely, before
// this fix, ANY authenticated user of ANY role (viewer, driver, mechanic
// -- anyone with a valid session) could:
//   1. PUT { id: <any tbladmin _id>, Role: 'super_admin' } and instantly
//      grant themselves (or anyone) super_admin -- full privilege
//      escalation, since Role is exactly the field lib/authOptions.ts's
//      resolveRole() reads at every subsequent login.
//   2. PUT { id: <someone else's _id>, Email: 'attacker@evil.com' } or
//      set an arbitrary Password string directly (stored raw, no
//      bcrypt) -- a full account-takeover primitive with no ownership
//      check of any kind.
//   3. Target ANY tenant's admin row by ID, since there was no tenantId
//      filter at all on this collection.
//
// Fixed by: (a) requiring the caller to be isSuperAdmin (SUPER_ADMIN or
// ORGANIZATION_OWNER, matching admin/register's existing gate),
// (b) scoping the target row to the caller's own tenant unless the
// caller is a literal platform SUPER_ADMIN, (c) whitelisting which
// fields are mutable at all -- Role and tenantId can only be changed by
// a literal SUPER_ADMIN, never by an organization_owner (who could
// otherwise re-parent their own admin row into another tenant or grant
// themselves platform-wide access), and (d) hashing Password with
// bcrypt if the caller legitimately resets one, instead of storing
// whatever raw string is posted.
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { getAuthContext } from "@/server/auth/auth-context";
import { Role } from "@/server/permissions/roles";

const MUTABLE_FIELDS = ["FirstName", "Email", "Password"] as const;
const PLATFORM_ONLY_FIELDS = ["Role", "tenantId"] as const;

export async function PUT(req: NextRequest) {
  const context = await getAuthContext(req);
  if (!context) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }
  if (!context.isSuperAdmin) {
    return NextResponse.json(
      { message: "You do not have permission to update admin accounts" },
      { status: 403 }
    );
  }

  const isPlatformSuperAdmin = context.roles.includes(Role.SUPER_ADMIN);

  const body = await req.json();
  const { id, ...rawUpdateData } = body as Record<string, unknown>;

  if (!id || typeof id !== "string" || !ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Missing or invalid admin ID" }, { status: 400 });
  }

  // Build the update from only the allow-listed fields -- never trust
  // the raw request body directly against the database.
  const updateData: Record<string, unknown> = {};
  for (const field of MUTABLE_FIELDS) {
    if (field in rawUpdateData) {
      updateData[field] = rawUpdateData[field];
    }
  }

  if (isPlatformSuperAdmin) {
    for (const field of PLATFORM_ONLY_FIELDS) {
      if (field in rawUpdateData) {
        updateData[field] = rawUpdateData[field];
      }
    }
  } else if (PLATFORM_ONLY_FIELDS.some((f) => f in rawUpdateData)) {
    return NextResponse.json(
      { message: "Only a platform super admin may change Role or tenantId" },
      { status: 403 }
    );
  }

  if (typeof updateData.Password === "string" && updateData.Password.length > 0) {
    if (updateData.Password.length < 8) {
      return NextResponse.json(
        { message: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }
    updateData.Password = await bcrypt.hash(updateData.Password, 10);
  } else {
    delete updateData.Password;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ message: "No valid fields to update" }, { status: 400 });
  }

  try {
    const db = await connectToDatabase();

    // Organization owners may only update admin rows within their own
    // tenant; a literal platform SUPER_ADMIN may update any.
    const filter: Record<string, unknown> = { _id: new ObjectId(id) };
    if (!isPlatformSuperAdmin) {
      filter.tenantId = context.tenantId;
    }

    const result = await db.collection("tbladmin").updateOne(filter, { $set: updateData });

    if (result.matchedCount === 0) {
      // Identical response whether the row doesn't exist or belongs to
      // a different tenant -- avoids confirming cross-tenant existence.
      return NextResponse.json({ message: "Admin not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Admin updated successfully" });
  } catch (err) {
    console.error("Update error:", err);
    return NextResponse.json({ message: "Server error during update" }, { status: 500 });
  }
}