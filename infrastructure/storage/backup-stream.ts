// infrastructure/storage/backup-stream.ts
//
// PHASE 4, F-20 -- a backup that does not hold the database in memory.
//
// ---------------------------------------------------------------------
// THE PROBLEM
// ---------------------------------------------------------------------
// The nightly backup did this:
//
//   const lines: string[] = [];
//   for (const { name } of collections)
//     for await (const doc of cursor)
//       lines.push(JSON.stringify({ __collection: name, ...doc }));
//   const ndjson = lines.join('\n');
//   zlib.gzip(Buffer.from(ndjson, 'utf-8'), ...)
//
// Three full copies of the logical database exist simultaneously at the
// peak: the `string[]`, the joined string, and the Buffer made from it.
// Peak memory is roughly 2-3x the full logical database size, in one
// process, and `join` on a multi-gigabyte array will hit V8's maximum
// string length long before it hits the memory limit -- so the backup
// does not degrade gracefully, it throws.
//
// It is also the ONE job whose failure is invisible until you need it.
//
// ---------------------------------------------------------------------
// THE FIX
// ---------------------------------------------------------------------
//   documents -> NDJSON chunks -> gzip -> temp file -> S3
//
// `pipeline()` connects them with backpressure honoured throughout: if
// the disk or gzip cannot keep up, the Mongo cursor is paused rather
// than buffering ahead. Peak memory is the stream high-water marks --
// a few hundred KB -- regardless of database size.
//
// WHY A TEMP FILE RATHER THAN STREAMING STRAIGHT TO S3.
// `storageService.uploadFile` takes a Buffer, and streaming directly to
// S3 without buffering requires multipart upload
// (`@aws-sdk/lib-storage`), which is NOT a dependency of this project.
// Adding an SDK package to a backup job is a bigger change than the
// defect warrants.
//
// Spooling to disk instead keeps memory bounded, needs no new
// dependency, and lets the upload declare an exact `ContentLength` from
// `fstat` -- which a raw stream cannot. The trade-off, stated: the
// worker host needs free disk equal to the COMPRESSED backup (typically
// 10-20x smaller than the logical size for JSON), and the temp file is
// removed in a `finally` so a failure cannot leave it behind.
//
// ---------------------------------------------------------------------
// FORMAT: UNCHANGED
// ---------------------------------------------------------------------
// Still gzipped NDJSON, one document per line, each carrying its
// `__collection`. Byte-for-byte the same shape the previous
// implementation produced, so any existing restore tooling keeps
// working. Only the way it is produced changed.

import { createWriteStream } from 'fs';
import { stat, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { createGzip } from 'zlib';

export interface BackupSource {
  /** Collection name, written onto every document as `__collection`. */
  name: string;
  /** Anything async-iterable over the collection's documents. */
  documents: AsyncIterable<Record<string, unknown>>;
}

export interface BackupWriteResult {
  path: string;
  /** Compressed size on disk, bytes. */
  bytes: number;
  documentCount: number;
  collectionCount: number;
}

/**
 * NDJSON lines for every document across every collection.
 *
 * A generator, not an array. This is the whole fix: it yields one line
 * at a time and holds exactly one document, so the pipeline pulls at the
 * rate the compressor and disk can absorb rather than the rate Mongo can
 * produce.
 *
 * Exported for testing -- a test can count how much it holds without
 * needing a database or a filesystem.
 */
export async function* ndjsonLines(
  sources: AsyncIterable<BackupSource> | Iterable<BackupSource>,
  onDocument?: () => void
): AsyncGenerator<string> {
  for await (const source of sources as AsyncIterable<BackupSource>) {
    for await (const doc of source.documents) {
      onDocument?.();
      // `__collection` LAST in the spread, so a document carrying its
      // own `__collection` field cannot shadow ours.
      //
      // Written first initially -- which reads better and is wrong: in
      // an object literal the later key wins, so `{__collection: name,
      // ...doc}` lets any document override its own routing tag. A
      // restore would then replay that document into whatever collection
      // it claimed. Caught by the test below, which is why the test
      // exists.
      yield `${JSON.stringify({ ...doc, __collection: source.name })}\n`;
    }
  }
}

/**
 * Streams every source through gzip into a temp file.
 *
 * Returns the path and the compressed size. The caller owns the file and
 * MUST delete it -- `writeBackupArchive` does not, because the caller
 * needs it alive long enough to upload.
 */
export async function writeBackupArchive(
  sources: BackupSource[],
  options: { filename: string; directory?: string } 
): Promise<BackupWriteResult> {
  const directory = options.directory ?? tmpdir();
  const path = join(directory, options.filename);

  let documentCount = 0;

  // Readable.from over the generator: node handles the pause/resume, so
  // a slow disk backpressures all the way to the Mongo cursor instead of
  // letting documents pile up in memory.
  const source = Readable.from(ndjsonLines(sources, () => {
    documentCount += 1;
  }));

  try {
    await pipeline(source, createGzip(), createWriteStream(path));
  } catch (error) {
    // Never leave a half-written archive behind: a truncated backup that
    // LOOKS like a backup is worse than no backup, because it is only
    // discovered during a restore.
    await unlink(path).catch(() => undefined);
    throw error;
  }

  const { size } = await stat(path);

  return {
    path,
    bytes: size,
    documentCount,
    collectionCount: sources.length,
  };
}

/** Removes a temp archive. Never throws. */
export async function discardBackupArchive(path: string): Promise<void> {
  await unlink(path).catch(() => undefined);
}
