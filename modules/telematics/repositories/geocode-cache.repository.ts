// modules/telematics/repositories/geocode-cache.repository.ts
//
// Cached reverse-geocoding results (`tblgeocode_cache`).
//
// ---------------------------------------------------------------------
// WHY THE CACHE IS TENANT-SCOPED AND NOT SHARED
// ---------------------------------------------------------------------
// The obvious design is one global cache: an address for a coordinate is
// a fact about the world, identical for every customer, and sharing it
// would cut the upstream request count across the whole platform.
//
// It is still the wrong design here, and the reason is the same one
// telematics.tenancy-addendum.ts gives for the collection it guards: in
// aggregate this is movement data. A shared cache is a list of every
// coordinate any tenant has ever looked at, with timestamps. Anyone able
// to read it -- or to probe it by timing a lookup that hits versus one
// that misses -- learns where other operators' vehicles have been. That
// is a cross-tenant inference channel built out of nothing but a
// performance optimisation, and it is exactly the class of leak this
// codebase has spent several phases eliminating.
//
// The saving does not justify it. Reverse geocoding runs for ONE
// selected vehicle at a time, not for the whole fleet, and the coarse
// grid below already collapses a parked vehicle's entire day into one
// entry.
//
// NOT org-unit scoped, deliberately: within a tenant this is derived
// reference data about a coordinate somebody in that organization
// already had the right to see, and per-unit partitioning would multiply
// upstream calls for a boundary the vehicle read itself already
// enforces.

import { Db, Filter } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';

/**
 * Grid resolution for the cache key, in decimal places.
 *
 * 4dp is roughly 11 m at the equator. Coarse enough that a stationary
 * vehicle's GPS jitter resolves to ONE cache entry instead of a new
 * upstream request every poll; fine enough that the answer is still the
 * right side of the street.
 *
 * Raising this is not free in the way it looks: at 5dp (~1.1 m) a parked
 * vehicle drifts across cells continuously and the cache stops working
 * at all, which is how a free upstream service gets an operator's IP
 * blocked.
 */
export const GEOCODE_GRID_DECIMALS = 4;

export interface GeocodeCacheEntry {
  _id?: string;
  tenantId: string;
  /** Grid cell key, `<lat>,<lng>` rounded to GEOCODE_GRID_DECIMALS. */
  cell: string;
  /** Formatted single-line address, or null for a confirmed "nowhere near anything". */
  address: string | null;
  /** Locality/town/city component, when the provider supplied one. */
  locality?: string;
  /** Road/street name, when the provider supplied one. */
  road?: string;
  provider: string;
  resolvedAt: Date;
}

/** The cache key for a coordinate. Exported so the service and its tests agree on one definition. */
export function geocodeCell(lat: number, lng: number): string {
  return `${lat.toFixed(GEOCODE_GRID_DECIMALS)},${lng.toFixed(GEOCODE_GRID_DECIMALS)}`;
}

export class GeocodeCacheRepository {
  private collectionName = 'tblgeocode_cache';

  private async collection() {
    const db: Db = await connectToDatabase();
    return db.collection<GeocodeCacheEntry>(this.collectionName);
  }

  async get(tenantId: string, cell: string): Promise<GeocodeCacheEntry | null> {
    const collection = await this.collection();
    return collection.findOne({ tenantId, cell } as Filter<GeocodeCacheEntry>);
  }

  /**
   * Stores a result, including a NEGATIVE one (`address: null`).
   *
   * Caching the negative matters: a coordinate in open farmland has no
   * nearest road, and without a stored "we asked and there is nothing"
   * every poll would re-ask an upstream service that already answered.
   * A failure to REACH the provider is a different thing entirely and is
   * never cached -- see the service.
   */
  async put(entry: Omit<GeocodeCacheEntry, '_id'>): Promise<void> {
    const collection = await this.collection();
    await collection.updateOne(
      { tenantId: entry.tenantId, cell: entry.cell } as Filter<GeocodeCacheEntry>,
      { $set: entry },
      { upsert: true }
    );
  }
}

export const geocodeCacheRepository = new GeocodeCacheRepository();
