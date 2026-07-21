/* eslint-disable prefer-const */
import { MongoClient, Db } from 'mongodb';
import { attachDbMonitoring } from '@/infrastructure/observability/db-monitoring';

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI environment variable is not defined');
}

// FIX: maxPoolSize/minPoolSize tuned down for serverless. On Vercel, every
// route can run in its own lambda instance; each *instance* gets its own
// pool once cached (see below), and many instances can run concurrently,
// so a large per-instance pool multiplies fast across the fleet of
// functions. Small pools per instance + reuse across warm invocations is
// the correct serverless pattern (mirrors MongoDB's own Vercel guidance).
const options = {
  maxPoolSize: 5,
  minPoolSize: 0,
  maxIdleTimeMS: 60_000,
  connectTimeoutMS: 10_000,
  // FIX: was missing — without this the driver falls back to its 30s
  // default, and a stuck/blocked network path can appear to hang far
  // longer (matches the ~296s hangs seen in the Vercel logs). Failing
  // fast means a real outage surfaces as a quick, clear 500 instead of a
  // multi-minute hang that also eats into the function's execution-time
  // budget.
  serverSelectionTimeoutMS: 10_000,
  socketTimeoutMS: 45_000,
  monitorCommands: true,
};

async function connectWithMonitoring(): Promise<MongoClient> {
  const client = new MongoClient(uri!, options);
  const connected = await client.connect();
  attachDbMonitoring(connected);
  return connected;
}

// FIX: this was the actual bug causing the 500s on Vercel. The client
// promise used to only be cached on `globalThis` when
// NODE_ENV === 'development' (to survive Next.js HMR reloads locally). In
// production it fell into the `else` branch and created a brand-new
// MongoClient — with its own fresh connection pool — on every cold start
// of every serverless function. With 250+ API routes, a single page load
// that fires several API calls in parallel could spin up a dozen+ lambdas
// simultaneously, each opening a new pool of connections at once. That
// connection storm is what was hitting Atlas's connection/rate limits and
// producing the long hangs -> MongoServerSelectionError -> 500s seen in
// the logs, intermittently, depending on which lambda instance was warm.
//
// The fix: cache the client promise on `globalThis` in ALL environments.
// Each serverless function instance still gets its own client (that part
// is unavoidable and fine), but it now reuses that same client/pool across
// every warm invocation of that instance instead of reconnecting every
// time — exactly what Vercel + MongoDB's official guidance recommends.
let clientPromise: Promise<MongoClient>;

if (!globalThis.__mongoClientPromise) {
  globalThis.__mongoClientPromise = connectWithMonitoring();
}
clientPromise = globalThis.__mongoClientPromise;

async function connectToDatabase(): Promise<Db> {
  const client = await clientPromise;
  return client.db('VehicleExpense');
}

export default connectToDatabase;
export { clientPromise };