// types/global.d.ts
import { MongoClient } from "mongodb";

declare global {
  const _mongoClient: MongoClient | undefined;
  const _mongoClientPromise: Promise<MongoClient> | undefined;
}
