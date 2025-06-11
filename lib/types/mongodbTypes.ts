import { MongoClient, Db } from "mongodb";

// Define the type for global variables related to MongoDB client
export interface GlobalMongoClient {
  _mongoClient?: MongoClient;
  _mongoClientPromise?: Promise<MongoClient>;
}

// Define the type of the connectToDatabase function
export type ConnectToDatabase = () => Promise<Db>;
