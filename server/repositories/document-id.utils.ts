// server/repositories/document-id.utils.ts
//
// The `_id` boundary, as free functions.
//
// ---------------------------------------------------------------------
// WHY THIS EXISTS SEPARATELY FROM BaseRepository
// ---------------------------------------------------------------------
// `BaseEntity._id` is declared `string`; the Mongo driver returns an
// `ObjectId`. `BaseRepository.normalizeDoc` bridges that for every
// repository that extends it -- but three do not:
//
//   AttentionDispatchRepository, EagleTrackTrackerLinkRepository,
//   EagleTrackTriggerRepository
//
// all stand alone and returned `find().toArray() as Promise<T[]>`, a
// cast that converts nothing. Their callers then treated `_id` as a
// string, and it behaves like one right up until it is compared or used
// in a query filter -- at which point a string silently matches no
// document and the write is a no-op.
//
// Duplicating the normalisation into three classes is how two
// implementations of one rule start. These functions are the single
// implementation; BaseRepository delegates to them.

import { ObjectId } from 'mongodb';

/**
 * Converts a document's top-level `_id` from ObjectId to string.
 *
 * SCOPE, deliberately narrow. It converts ONLY the top-level `_id`, and
 * only when it really is an ObjectId:
 *
 *   * reference fields (vehicleId, orgUnitId, driver_id) are already
 *     stored as strings in this schema, so there is nothing to fix;
 *   * a deep walk would cost a traversal on every read;
 *   * and it would rewrite ObjectIds inside caller payloads that may
 *     legitimately hold them.
 *
 * An aggregation's `_id` is a GROUP KEY, not a document id, which is why
 * aggregate pipelines are deliberately not run through this.
 */
export function normalizeDocumentId<R>(doc: unknown): R {
  if (!doc || typeof doc !== 'object') return doc as R;
  const raw = doc as Record<string, unknown>;
  const id = raw._id;
  if (id instanceof ObjectId) {
    return { ...raw, _id: id.toHexString() } as R;
  }
  return doc as R;
}

export function normalizeDocumentIds<R>(docs: readonly unknown[]): R[] {
  return docs.map((doc) => normalizeDocumentId<R>(doc));
}

/**
 * Converts a normalised (string) id back into an ObjectId for a query
 * filter.
 *
 * Use whenever a document that came out of a repository is fed into a
 * raw `collection.updateOne({ _id })`: a bare string matches nothing
 * there, and the write silently does nothing at all.
 */
export function toObjectId(id: string | ObjectId): ObjectId {
  return id instanceof ObjectId ? id : new ObjectId(id);
}
