import { MongoClient, Db } from 'mongodb';
import { attachDbMonitoring } from '@/infrastructure/observability/db-monitoring';

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI environment variable is not defined');
}

const options = {
  maxPoolSize: 10,
  minPoolSize: 2,
  maxIdleTimeMS: 60_000,                                                                                                                                                                             
  connectTimeoutMS: 10_000,
  socketTimeoutMS: 45_000,
  monitorCommands: true,
};

async function connectWithMonitoring(): Promise<MongoClient> {
  const client = new MongoClient(uri!, options);
  const connected = await client.connect();
  attachDbMonitoring(connected);
  return connected;
}

let _mongoClientPromise: Promise<MongoClient> | undefined;

let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  // Preserve connection across HMR reloads in dev
  if (!globalThis.__mongoClientPromise) {
    globalThis.__mongoClientPromise = connectWithMonitoring();
  }
  clientPromise = globalThis.__mongoClientPromise;
} else {
  clientPromise = connectWithMonitoring();
}

async function connectToDatabase(): Promise<Db> {
  const client = await clientPromise;
  return client.db('VehicleExpense');
}

export default connectToDatabase;
export { clientPromise };