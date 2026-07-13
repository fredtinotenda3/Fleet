// app/api/admin/delete/route.ts
//
// FIX (🔴 Critical -- unauthorized account deletion / cross-tenant):
// previously only required *a* session (requireAuth()), with no role
// check and no tenant scoping. Any authenticated user of any role could
// permanently hard-delete ANY tbladmin row in ANY tenant by ID --
// including another organization's owner account, or a platform super
// admin's account, simply by guessing/enumerating an ObjectId. Fixed by
// requiring isSuperAdmin (matching admin/register's + admin/update's
// gate) and scoping the delete to the caller's own tenant unless the
// caller is a literal platform SUPER_ADMIN. Also blocks a caller from
// deleting their own account through this blunt endpoint.
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import connectToDatabase from "@/lib/mongodb";
import { getAuthContext } from "@/server/auth/auth-context";
import { Role } from "@/server/permissions/roles";

export async function DELETE(req: NextRequest) {
  const context = await getAuthContext(req);
  if (!context) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }
  if (!context.isSuperAdmin) {
    return NextResponse.json(
      { message: "You do not have permission to delete admin accounts" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id || !ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Missing or invalid admin ID" }, { status: 400 });
  }

  if (id === context.userId) {
    return NextResponse.json(
      { message: "You cannot delete your own account through this endpoint" },
      { status: 400 }
    );
  }

  const isPlatformSuperAdmin = context.roles.includes(Role.SUPER_ADMIN);

  try {
    const db = await connectToDatabase();

    const filter: Record<string, unknown> = { _id: new ObjectId(id) };
    if (!isPlatformSuperAdmin) {
      filter.tenantId = context.tenantId;
    }

    const result = await db.collection("tbladmin").deleteOne(filter);

    if (result.deletedCount === 0) {
      return NextResponse.json({ message: "Admin not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Admin deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err);
    return NextResponse.json({ message: "Server error during deletion" }, { status: 500 });
  }
}