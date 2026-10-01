// modules/telematics/repositories/geocode-search-cache.repository.ts
//
// Cached forward-geocoding results (`tblgeocode_search_cache`) -- the
// "type a place name, get candidate locations" half of geocoding, as
// opposed to geocode-cache.repository.ts's "coordinate -> address"
// reverse half.
//
// Same tenancy reasoning as geocode-cache.repository.ts, repeated
// rather than merely cross-referenced because it is the whole basis for
// this being a separate collection instead of a shared one: a cache of
// which PLACE NAMES a tenant's operators search for, with timestamps, is
// itself an operational-pattern disclosure (a competitor's dispatcher
// searching the same depot names reveals their delivery area). NOT
// shared across tenants, and NOT org-unit scoped for the same "the read
// that uses this is already scoped; partitioning further only multiplies
// upstream calls" reason geocode-cache.repository.ts gives.
//
// TTL: forward-search results (place name -> coordinates) are far more
// durable than reverse ones -- "Mt Pleasant, Harare" resolves to the same
// place for years, not just "no new building has gone up here since the
// last 90-day window". A longer TTL (180 days) is still finite, not
// infinite, as an eventual hedge against Nominatim data corrections.

import { Db, Filter } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';

export const GEOCODE_SEARCH_CACHE_TTL_DAYS = 180;

export interface GeocodeSearchCandidate {
  label: string;
  lat: number;
  lng: number;
  address?: string;
}

export interface GeocodeSearchCacheEntry {
  _id?: string;
  tenantId: string;
  /** Normalized (trimmed, lower-cased, whitespace-collapsed) search text. */
  normalizedQuery: string;
  candidates: GeocodeSearchCandidate[];
  provider: string;
  resolvedAt: Date;
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export class GeocodeSearchCacheRepository {
  private collectionName = 'tblgeocode_search_cache';

  private async collection() {
    const db: Db = await connectToDatabase();
    return db.collection<GeocodeSearchCacheEntry>(this.collectionName);
  }

  async get(tenantId: string, normalizedQuery: string): Promise<GeocodeSearchCacheEntry | null> {
    const collection = await this.collection();
    const entry = await collection.findOne({
      tenantId,
      normalizedQuery,
    } as Filter<GeocodeSearchCacheEntry>);

    if (!entry) return null;

    const ageMs = Date.now() - new Date(entry.resolvedAt).getTime();
    if (ageMs > GEOCODE_SEARCH_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) {
      // Expired: treated as a miss rather than deleted here -- a
      // concurrent request may be mid-refresh, and `put` below upserts
      // regardless, so an expired row is simply overwritten on the next
      // successful lookup rather than needing a separate sweep.
      return null;
    }
    return entry;
  }

  async put(entry: Omit<GeocodeSearchCacheEntry, '_id'>): Promise<void> {
    const collection = await this.collection();
    await collection.updateOne(
      { tenantId: entry.tenantId, normalizedQuery: entry.normalizedQuery } as Filter<GeocodeSearchCacheEntry>,
      { $set: entry },
      { upsert: true }
    );
  }
}

export const geocodeSearchCacheRepository = new GeocodeSearchCacheRepository();
