import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { requireAuth } from "@/lib/requireAuth";

export async function POST(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const { records } = await req.json();
    
    if (!records || !Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: "No records to import" }, { status: 400 });
    }

    const db = await connectToDatabase();
    const expensesCollection = db.collection("tblexpenses");
    
    const results = {
      inserted: 0,
      errors: 0,
      errorDetails: [] as string[],
    };

    for (const record of records) {
      try {
        // Find or create expense type
        let expenseTypeId = null;
        if (record.category) {
          let expenseType = await db.collection("tblexpense_types").findOne({
            name: { $regex: `^${record.category}$`, $options: "i" }
          });
          
          if (!expenseType) {
            const result = await db.collection("tblexpense_types").insertOne({
              name: record.category,
              category: record.category,
              isDeleted: false,
              createdAt: new Date(),
            });
            expenseTypeId = result.insertedId;
          } else {
            expenseTypeId = expenseType._id;
          }
        }

        // Insert expense
        await expensesCollection.insertOne({
          license_plate: record.vehiclePlate || "UNKNOWN",
          amount: record.totalAmount,
          date: new Date(record.date),
          expense_type_id: expenseTypeId ? new ObjectId(expenseTypeId) : null,
          description: record.items.join(", "),
          notes: `Ref: ${record.reference} | Account: ${record.account} | Cost Centre: ${record.costCentre}`,
          isDeleted: false,
          createdAt: new Date(),
        });
        
        results.inserted++;
      } catch (err) {
        results.errors++;
        results.errorDetails.push(`Failed to import record: ${record.reference}`);
      }
    }

    return NextResponse.json({
      message: `Import completed: ${results.inserted} inserted, ${results.errors} errors`,
      results,
    });
  } catch (error) {
    console.error("Bulk import error:", error);
    return NextResponse.json({ error: "Failed to import records" }, { status: 500 });
  }
}