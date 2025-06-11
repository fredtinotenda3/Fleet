import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { updateReminderStatuses } from "../lib/updateReminderStatuses";

let mongoServer: MongoMemoryServer;
let client: MongoClient;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  client = new MongoClient(uri);
  await client.connect();
});

afterAll(async () => {
  if (client) await client.close();
  if (mongoServer) await mongoServer.stop();
});

test("should update reminder statuses correctly", async () => {
  const db = client.db("test-db");
  const collection = db.collection("tblreminders");

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  await collection.insertMany([
    { license_plate: "ABC123", reminder_type: "Oil", due_date: yesterday },
    { license_plate: "XYZ789", reminder_type: "Service", due_date: tomorrow },
    { license_plate: "DEF456", reminder_type: "Tires", due_date: now },
  ]);

  const updatedCount = await updateReminderStatuses(db);
  expect(updatedCount).toBe(3);

  const updated = await collection.find().toArray();
  const dueStatuses = updated.map((r) => r.status);
  expect(dueStatuses).toEqual(["due", "not due", "due"]);
});
