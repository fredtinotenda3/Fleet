// tests/unit/infrastructure/backup-streaming.spec.ts
//
// PHASE 4, F-20 -- the backup must not hold the database in memory.
//
// The defect: the nightly backup pushed every document of every
// collection into a `string[]`, joined it, and made a Buffer from the
// result. Three full copies of the logical database existed at the peak
// (~2-3x its size), and `join` on a multi-gigabyte array hits V8's
// maximum string length before the memory limit -- so the job did not
// degrade gracefully, it threw. It is also the one job whose failure
// stays invisible until the moment you need it.
//
// These tests run against the real filesystem (a temp directory), not a
// database: the property under test is the WRITER's memory behaviour and
// output format, which is entirely inside this module.

import { readFile, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { gunzipSync } from 'zlib';

import {
  ndjsonLines,
  writeBackupArchive,
  discardBackupArchive,
  BackupSource,
} from '@/infrastructure/storage/backup-stream';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'backup-test-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** An async iterable that reports how many documents have been pulled. */
function trackedDocs(count: number, collection: string, state: { pulled: number }) {
  return {
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < count; i += 1) {
        state.pulled += 1;
        yield { _id: `${collection}-${i}`, value: i, collection };
      }
    },
  };
}

describe('F-20: the writer streams instead of accumulating', () => {
  it('holds one document at a time, not the whole set', async () => {
    // THE regression. The generator is pulled lazily: after consuming
    // three lines, only three documents have been produced -- the
    // remaining 9,997 have not been touched. Under the old
    // implementation all 10,000 were in a string[] before anything was
    // written.
    const state = { pulled: 0 };
    const sources: BackupSource[] = [
      { name: 'tblbig', documents: trackedDocs(10_000, 'tblbig', state) },
    ];

    const iterator = ndjsonLines(sources);
    await iterator.next();
    await iterator.next();
    await iterator.next();

    expect(state.pulled).toBe(3);
    expect(state.pulled).toBeLessThan(10_000);
  });

  it('never materialises an array of all documents', () => {
    // Structural guard against reintroducing the defect. Comments are
    // stripped because this module's own header QUOTES the old code in
    // order to explain it.
    const fs = require('fs');
    const path = require('path');
    const code = fs
      .readFileSync(
        path.resolve(__dirname, '../../../infrastructure/storage/backup-stream.ts'),
        'utf8'
      )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(code).not.toMatch(/lines\s*\.push/);
    expect(code).not.toMatch(/\.join\(['"`]\\n/);
    expect(code).toContain('pipeline(');
  });

  it('the backup worker passes cursors through, never .toArray()', () => {
    // Calling .toArray() per collection would reintroduce the defect one
    // collection at a time.
    const fs = require('fs');
    const path = require('path');
    const code = fs
      .readFileSync(path.resolve(__dirname, '../../../workers/backup.worker.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    // Scoped to the DOCUMENT cursor. `db.listCollections().toArray()` is
    // fine and stays -- it materialises a list of collection NAMES,
    // which is tens of entries, not the database. The defect is
    // materialising `find({})`, which is every document.
    expect(code).not.toMatch(/find\(\{\}\)[\s\S]{0,40}\.toArray\(\)/);
    expect(code).toContain('writeBackupArchive');
    expect(code).toContain('uploadStream');
  });
});

describe('F-20: the archive is valid and complete', () => {
  it('produces gzip that decompresses to NDJSON', async () => {
    const state = { pulled: 0 };
    const result = await writeBackupArchive(
      [{ name: 'tblvehicles', documents: trackedDocs(3, 'tblvehicles', state) }],
      { filename: 'test.ndjson.gz', directory: dir }
    );

    const raw = gunzipSync(await readFile(result.path)).toString('utf8');
    const lines = raw.trim().split('\n');

    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('tags every line with its collection', async () => {
    // Format preserved exactly, so existing restore tooling keeps
    // working -- only the way it is produced changed.
    const state = { pulled: 0 };
    const result = await writeBackupArchive(
      [
        { name: 'tblvehicles', documents: trackedDocs(2, 'tblvehicles', state) },
        { name: 'tbldrivers', documents: trackedDocs(2, 'tbldrivers', state) },
      ],
      { filename: 'test.ndjson.gz', directory: dir }
    );

    const lines = gunzipSync(await readFile(result.path))
      .toString('utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));

    expect(lines.filter((l) => l.__collection === 'tblvehicles')).toHaveLength(2);
    expect(lines.filter((l) => l.__collection === 'tbldrivers')).toHaveLength(2);
  });

  it("a document's own __collection cannot shadow ours", async () => {
    const sources: BackupSource[] = [
      {
        name: 'tblreal',
        documents: (async function* () {
          yield { _id: '1', __collection: 'tblspoofed' };
        })(),
      },
    ];

    const result = await writeBackupArchive(sources, {
      filename: 'test.ndjson.gz',
      directory: dir,
    });
    const line = JSON.parse(gunzipSync(await readFile(result.path)).toString('utf8').trim());

    expect(line.__collection).toBe('tblreal');
  });

  it('reports counts and compressed size', async () => {
    const state = { pulled: 0 };
    const result = await writeBackupArchive(
      [
        { name: 'a', documents: trackedDocs(5, 'a', state) },
        { name: 'b', documents: trackedDocs(7, 'b', state) },
      ],
      { filename: 'test.ndjson.gz', directory: dir }
    );

    expect(result.documentCount).toBe(12);
    expect(result.collectionCount).toBe(2);
    expect(result.bytes).toBeGreaterThan(0);
  });

  it('handles an empty database without producing a broken archive', async () => {
    const result = await writeBackupArchive([], {
      filename: 'empty.ndjson.gz',
      directory: dir,
    });

    expect(result.documentCount).toBe(0);
    expect(gunzipSync(await readFile(result.path)).toString('utf8')).toBe('');
  });

  it('deletes a half-written archive when the source fails', async () => {
    // A truncated backup that LOOKS like a backup is worse than no
    // backup: it is only discovered during a restore.
    const sources: BackupSource[] = [
      {
        name: 'tblbroken',
        documents: (async function* () {
          yield { _id: '1' };
          throw new Error('cursor died');
        })(),
      },
    ];

    await expect(
      writeBackupArchive(sources, { filename: 'broken.ndjson.gz', directory: dir })
    ).rejects.toThrow('cursor died');

    await expect(readFile(join(dir, 'broken.ndjson.gz'))).rejects.toThrow();
  });

  it('discard never throws on a missing file', async () => {
    await expect(discardBackupArchive(join(dir, 'nope.gz'))).resolves.toBeUndefined();
  });
});
