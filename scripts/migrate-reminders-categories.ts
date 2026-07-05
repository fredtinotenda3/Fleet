/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Migration script to add category and priority fields to existing reminders
 *
 * Run with: npx ts-node scripts/migrate-reminders-categories.ts
 */

import { MongoClient, Db } from "mongodb";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

type MaintenanceCategory =
  | "braking_system"
  | "fuel_system"
  | "spring_suspension"
  | "auto_electricals"
  | "engine_gearbox"
  | "cab_body";

interface ReminderDocument {
  _id: any;
  license_plate: string;
  title: string;
  status: string;
  due_date: Date | string;
  notes?: string;
  // Allow `null` explicitly so the migration query below
  // (`{ category: null }`) type-checks against Mongo's Filter<T>.
  category?: MaintenanceCategory | null;
  priority?: string;
  recurrence_interval?: string;
  completion_date?: Date | string;
  created_at?: Date;
}

const CATEGORY_KEYWORDS: Record<MaintenanceCategory, string[]> = {
  braking_system: [
    "brake", "braking", "airline", "bulge", "mounding bolt",
    "oil seepage", "drum", "low air warning", "master cylinder",
    "clutch pedal", "pedal free travel", "brake fluid", "exhaust leak"
  ],
  fuel_system: [
    "fuel", "fuel leak", "fuel tank", "cooling system", "gas", "petrol", "diesel"
  ],
  spring_suspension: [
    "spring", "suspension", "u bolt", "leaf spring", "shock", "axle bolt",
    "axle", "lubricant", "steering joint", "chassis bolt", "wheel alignment",
    "tyre", "tire", "universal joint", "steering wheel", "tie rod"
  ],
  auto_electricals: [
    "electrical", "light", "brake light", "taillight", "turn signal",
    "siren", "emergency light", "headlight", "battery", "terminal",
    "instrument", "horn", "fan belt", "water pump", "coolant leak",
    "transmission overheating", "clutch", "foot throttle", "charging system",
    "alternator", "starter", "wiring"
  ],
  engine_gearbox: [
    "engine", "gearbox", "transmission", "overhaul", "motor oil",
    "tappet", "ignition timing", "oil change", "filter"
  ],
  cab_body: [
    "cab", "body", "mirror", "door", "glass", "lock", "key", "panel"
  ],
};

const CRITICAL_KEYWORDS = [
  "leak", "cracked", "broken", "inoperative", "failure", "overheating",
  "seepage", "missing", "warning", "emergency", "airline"
];

const HIGH_KEYWORDS = [
  "loose", "defective", "faulty", "worn", "adjust", "replace",
  "check", "inspect", "tighten"
];

function determineCategory(title: string): MaintenanceCategory {
  const lowerTitle = title.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerTitle.includes(keyword.toLowerCase())) {
        return category as MaintenanceCategory;
      }
    }
  }

  return "engine_gearbox";
}

function determinePriority(title: string): string {
  const lowerTitle = title.toLowerCase();

  for (const keyword of CRITICAL_KEYWORDS) {
    if (lowerTitle.includes(keyword.toLowerCase())) {
      return "critical";
    }
  }

  for (const keyword of HIGH_KEYWORDS) {
    if (lowerTitle.includes(keyword.toLowerCase())) {
      return "high";
    }
  }

  if (lowerTitle.includes("oil change") || lowerTitle.includes("tune")) {
    return "medium";
  }

  if (lowerTitle.includes("inspection") || lowerTitle.includes("check")) {
    return "low";
  }

  return "medium";
}

async function migrateReminders() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI environment variable is not defined");
    process.exit(1);
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db("VehicleExpense");
    const collection = db.collection<ReminderDocument>("tblreminders");

    const reminders = await collection.find({
      $or: [
        { category: { $exists: false } },
        { category: null }
      ]
    }).toArray();

    console.log(`📋 Found ${reminders.length} reminders to migrate`);

    if (reminders.length === 0) {
      console.log("✅ No reminders need migration");
      await client.close();
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const stats: Record<MaintenanceCategory, number> = {
      braking_system: 0,
      fuel_system: 0,
      spring_suspension: 0,
      auto_electricals: 0,
      engine_gearbox: 0,
      cab_body: 0,
    };
    const priorityStats: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const reminder of reminders) {
      const title = reminder.title || "";

      if (!title) {
        console.log(`⚠️ Skipping reminder ${reminder._id} - no title`);
        skippedCount++;
        continue;
      }

      const category = determineCategory(title);
      const priority = determinePriority(title);

      const result = await collection.updateOne(
        { _id: reminder._id },
        {
          $set: {
            category,
            priority,
            updated_at: new Date()
          }
        }
      );

      if (result.modifiedCount > 0) {
        updatedCount++;
        stats[category]++;
        priorityStats[priority]++;
        console.log(`✅ Updated: "${title.substring(0, 50)}" → ${category} (${priority})`);
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log("📊 MIGRATION SUMMARY");
    console.log("=".repeat(50));
    console.log(`✅ Total reminders updated: ${updatedCount}`);
    console.log(`⚠️ Skipped: ${skippedCount}`);
    console.log(`📋 Total processed: ${reminders.length}`);

    console.log("\n📁 Category Distribution:");
    for (const [category, count] of Object.entries(stats)) {
      const categoryName = category.replace("_", " ").toUpperCase();
      console.log(`   ${categoryName}: ${count}`);
    }

    console.log("\n⚠️ Priority Distribution:");
    for (const [priority, count] of Object.entries(priorityStats)) {
      console.log(`   ${priority.toUpperCase()}: ${count}`);
    }

    console.log("\n✅ Migration completed successfully!");

  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

migrateReminders().catch(console.error);