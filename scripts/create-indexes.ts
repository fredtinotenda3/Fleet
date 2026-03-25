/**
 * Run once to create all MongoDB indexes for the Fleet app.
 *
 * Usage:
 *   npx ts-node -e "require('./scripts/create-indexes.ts')"
 *
 * Or add to package.json scripts:
 *   "db:indexes": "npx ts-node scripts/create-indexes.ts"
 *
 * Then run: npm run db:indexes
 */

import { MongoClient } from "mongodb";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const uri = process.env.MONGODB_URI!;
if (!uri) throw new Error("MONGODB_URI is not defined in .env");

async function createIndexes() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db("VehicleExpense");

    console.log("Connected to MongoDB. Creating indexes...\n");

    // ── tblvehicles ──────────────────────────────────────────────
    await db.collection("tblvehicles").createIndexes([
      // Most common query: filter by license_plate + not deleted
      { key: { license_plate: 1, isDeleted: 1 }, name: "idx_vehicle_plate_deleted" },
      // Status filter on the details/dashboard pages
      { key: { status: 1, isDeleted: 1 }, name: "idx_vehicle_status_deleted" },
      // Make/model search
      { key: { make: 1, model: 1 }, name: "idx_vehicle_make_model" },
    ]);
    console.log("✓ tblvehicles indexes created");

    // ── tblexpenses ──────────────────────────────────────────────
    await db.collection("tblexpenses").createIndexes([
      // Per-vehicle expense lookup (most frequent)
      { key: { license_plate: 1, isDeleted: 1 }, name: "idx_expense_plate_deleted" },
      // Date range filtering on analytics pages
      { key: { date: -1 }, name: "idx_expense_date_desc" },
      // Type filtering
      { key: { expense_type_id: 1 }, name: "idx_expense_type" },
      // Combined: plate + date for per-vehicle time-range queries
      { key: { license_plate: 1, date: -1 }, name: "idx_expense_plate_date" },
    ]);
    console.log("✓ tblexpenses indexes created");

    // ── tblfuellogs ──────────────────────────────────────────────
    await db.collection("tblfuellogs").createIndexes([
      // Per-vehicle fuel log lookup
      { key: { license_plate: 1 }, name: "idx_fuel_plate" },
      // Date filtering
      { key: { date: -1 }, name: "idx_fuel_date_desc" },
      // Combined: plate + date for efficiency calculations
      { key: { license_plate: 1, date: -1 }, name: "idx_fuel_plate_date" },
    ]);
    console.log("✓ tblfuellogs indexes created");

    // ── tblmeterlogs ─────────────────────────────────────────────
    await db.collection("tblmeterlogs").createIndexes([
      // Per-vehicle meter log lookup (most frequent)
      { key: { license_plate: 1 }, name: "idx_meter_plate" },
      // Date sort (used everywhere)
      { key: { date: -1 }, name: "idx_meter_date_desc" },
      // Combined: plate + date for last odometer reading
      { key: { license_plate: 1, date: -1 }, name: "idx_meter_plate_date" },
    ]);
    console.log("✓ tblmeterlogs indexes created");

    // ── tblreminders ─────────────────────────────────────────────
    await db.collection("tblreminders").createIndexes([
      // Per-vehicle reminder lookup
      { key: { license_plate: 1 }, name: "idx_reminder_plate" },
      // Status filtering (overdue/pending dashboards)
      { key: { status: 1 }, name: "idx_reminder_status" },
      // Due date sorting and overdue detection
      { key: { due_date: 1 }, name: "idx_reminder_due_date" },
      // Combined: status + due_date for overdue queries
      { key: { status: 1, due_date: 1 }, name: "idx_reminder_status_due" },
    ]);
    console.log("✓ tblreminders indexes created");

    // ── tblexpense_types ─────────────────────────────────────────
    await db.collection("tblexpense_types").createIndexes([
      // Soft delete filter + name sort
      { key: { isDeleted: 1, name: 1 }, name: "idx_expense_type_deleted_name" },
    ]);
    console.log("✓ tblexpense_types indexes created");

    // ── tblunits ─────────────────────────────────────────────────
    await db.collection("tblunits").createIndexes([
      // unit_id is the FK used everywhere — must be fast
      { key: { unit_id: 1 }, name: "idx_unit_id", unique: true },
      // Type filtering (distance vs volume)
      { key: { type: 1 }, name: "idx_unit_type" },
    ]);
    console.log("✓ tblunits indexes created");

    // ── tbladmin ─────────────────────────────────────────────────
    await db.collection("tbladmin").createIndexes([
      // Login lookup by email
      { key: { Email: 1 }, name: "idx_admin_email", unique: true },
    ]);
    console.log("✓ tbladmin indexes created");

    console.log("\nAll indexes created successfully.");
  } catch (error) {
    console.error("Error creating indexes:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

createIndexes();