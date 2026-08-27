// workers/backup.worker.ts

import { BaseWorker } from '@/infrastructure/queue/worker-base.service';
import { storageService } from '@/infrastructure/storage/storage.service';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import connectToDatabase from '@/infrastructure/database/mongodb';
import {
  writeBackupArchive,
  discardBackupArchive,
  BackupSource,
} from '@/infrastructure/storage/backup-stream';

/**
 * Nightly logical backup: dumps every collection to newline-delimited
 * JSON, gzips it, and uploads the archive to the storage backend
 * (StorageService, S3-backed). This is a logical/document-level backup
 * suitable for disaster recovery of application data; it is not a
 * substitute for MongoDB Atlas's own point-in-time continuous backups
 * where available â€” treat this as the portable, storage-provider-agnostic
 * safety net.
 */
export class BackupWorker extends BaseWorker<Record<string, never>> {
  constructor() {
    super('backup-jobs');
  }

  protected async process(_jobName: string): Promise<void> {
    /**
     * PHASE 4, F-20 -- streamed, not buffered.
     *
     * This method used to build a `string[]` of every document in every
     * collection, `join('\n')` it, and gzip the resulting Buffer. Three
     * full copies of the logical database existed at the peak, so peak
     * memory was ~2-3x the database size -- and `join` on a
     * multi-gigabyte array hits V8's maximum string length long before
     * the memory limit, so the job did not degrade gracefully, it threw.
     *
     * It is also the one job whose failure stays invisible until the
     * moment you need it.
     *
     * Now: documents -> NDJSON -> gzip -> temp file -> S3, connected by
     * `pipeline()` so backpressure reaches all the way back to the Mongo
     * cursor. Peak memory is the stream high-water marks regardless of
     * database size. The output format is unchanged, so existing restore
     * tooling keeps working.
     */
    const db = await connectToDatabase();
    const collections = await db.listCollections().toArray();

    const filename = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson.gz`;

    const sources: BackupSource[] = collections.map(({ name }) => ({
      name,
      // The cursor is passed UNCONSUMED. Calling .toArray() here would
      // reintroduce the defect one collection at a time.
      documents: db.collection(name).find({}) as unknown as AsyncIterable<
        Record<string, unknown>
      >,
    }));

    const archive = await writeBackupArchive(sources, { filename });

    try {
      const stored = await storageService.uploadStream({
        tenantId: 'system',
        entityType: 'backup',
        entityId: 'nightly',
        sourcePath: archive.path,
        filename,
        mimeType: 'application/gzip',
      });

      monitoring.logInfo(
        `[BackupWorker] Backed up ${archive.documentCount} document(s) across ` +
          `${archive.collectionCount} collection(s) (${archive.bytes} bytes gzipped) -> ${stored.key}`
      );

      await auditLog.log({
        action: 'BACKUP_COMPLETED',
        userId: 'system',
        tenantId: 'system',
        entityType: 'backup',
        category: 'system',
        severity: 'info',
        metadata: {
          key: stored.key,
          size: stored.size,
          documentCount: archive.documentCount,
          collectionCount: archive.collectionCount,
        },
      });
    } finally {
      // Always removed, including after an upload failure: a worker host
      // that accumulates one archive per failed nightly run fills its
      // disk and then cannot back up at all.
      await discardBackupArchive(archive.path);
    }
  }
}