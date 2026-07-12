import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { requireAuth } from "@/lib/requireAuth";
import { getTenantFromRequest } from "@/server/utils/context.utils";

const COLLECTION = "tblexpenses";

// FIX (🔴 Critical — tenant isolation): this legacy handler proved a
// session existed (requireAuth) but never scoped the query by
// tenantId, unlike every other write in this module (see
// app/api/expenses/route.ts -> expenseController -> tenant-scoped
// repository). That meant any authenticated user from ANY organization
// could soft-delete an expense belonging to a DIFFERENT organization,
// simply by knowing or guessing its ObjectId. Every query below is now
// scoped to the caller's own tenantId, matching the rest of the
// expenses module's trust model.
export async function DELETE(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const pathSegments = new URL(req.url).pathname.split("/");
    const id = pathSegments[pathSegments.length - 1];

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid or missing ID" }, { status: 400 });
    }

    const tenantId = await getTenantFromRequest(req);
    const db = await connectToDatabase();

    const existingExpense = await db.collection(COLLECTION).findOne({
      _id: new ObjectId(id),
      tenantId,
      isDeleted: { $ne: true },
    });

    if (!existingExpense) {
      // Deliberately identical response whether the expense doesn't
      // exist or simply belongs to a different tenant — a 404 either
      // way avoids leaking that a given ID exists in someone else's org.
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const result = await db
      .collection(COLLECTION)
      .updateOne({ _id: new ObjectId(id), tenantId }, { $set: { isDeleted: true } });

    if (result.modifiedCount === 0) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Expense deleted successfully" });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete expense", details: (error as Error).message },
      { status: 500 }
    );
  }
}