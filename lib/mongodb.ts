// import { MongoClient, Db } from "mongodb";

// // Extend global type declarations
// declare const global: typeof globalThis & {
//   _mongoClient?: MongoClient;
//   _mongoClientPromise?: Promise<MongoClient>;
// };

// const uri = "mongodb://127.0.0.1:27017";
// //const uri = "mongodb://127.0.0.1:27017";
// const options = {};

// if (!global._mongoClientPromise) {
//   const client = new MongoClient(uri, options);
//   global._mongoClient = client;
//   global._mongoClientPromise = client.connect();
// }

// const clientPromise = global._mongoClientPromise;

// const connectToDatabase: () => Promise<Db> = async () => {
//   const client = await clientPromise;
//   return client.db("vehicle-expense-tracker");
// };

// export default connectToDatabase;
// export type { Db, MongoClient };
// export type ConnectToDatabase = typeof connectToDatabase;

// ATLAS

import { MongoClient, Db } from "mongodb";

declare const global: typeof globalThis & {
  _mongoClient?: MongoClient;
  _mongoClientPromise?: Promise<MongoClient>;
};

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI environment variable is not defined");
}

const options = {};

if (!global._mongoClientPromise) {
  const client = new MongoClient(uri, options);
  global._mongoClient = client;
  global._mongoClientPromise = client.connect();
}

const clientPromise = global._mongoClientPromise;

const connectToDatabase: () => Promise<Db> = async () => {
  const client = await clientPromise;
  return client.db("VehicleExpense"); // Ensure DB name matches Atlas
};

export default connectToDatabase;
export type { Db, MongoClient };
export type ConnectToDatabase = typeof connectToDatabase;
