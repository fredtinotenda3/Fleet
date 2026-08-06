// lib/mongodb.ts
//
// FIX: this file used to create its OWN separate MongoClient with its own
// connection pool (`global._mongoClientPromise`), completely independent
// from the pooled, monitored client in infrastructure/database/mongodb.ts
// (`globalThis.__mongoClientPromise`). That meant the app was opening TWO
// connection pools to the same Atlas cluster — one tuned (maxPoolSize,
// timeouts, slow-query monitoring) and one untuned with Mongo driver
// defaults. Every file that imported from here (including
// lib/authOptions.ts) was going through the untuned, unmonitored pool.
//
// This file now just re-exports the single shared client so there's one
// pool, one set of monitored slow-query logs, and no duplicate handshake
// overhead on startup.

import connectToDatabase, { getClientPromise } from '@/infrastructure/database/mongodb';
import type { Db, MongoClient } from 'mongodb';

export default connectToDatabase;
// `clientPromise` was an eagerly-created promise; it is now a lazy
// getter so importing this file no longer opens a connection.
export { getClientPromise };
export type { Db, MongoClient };
export type ConnectToDatabase = typeof connectToDatabase;