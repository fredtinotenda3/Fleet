// workers/backup.worker.ts

import { BaseWorker } from '@/infrastructure/queue/worker-base.service';
import { storageService } from '@/infrastructure/storage/storage.service';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import connectToDatabase from '@/infrastructure/database/mongodb';

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
    const zlib = await import('zlib');
    const db = await connectToDatabase();
    const collections = await db.listCollections().toArray();

    const lines: string[] = [];
    let totalDocs = 0;

    for (const { name } of collections) {
      const cursor = db.collection(name).find({});
      for await (const doc of cursor) {
        lines.push(JSON.stringify({ __collection: name, ...doc }));
        totalDocs++;
      }
    }

    const ndjson = lines.join('\n');
    const gzipped: Buffer = await new Promise((resolve, reject) => {
      zlib.gzip(Buffer.from(ndjson, 'utf-8'), (err, result) => (err ? reject(err) : resolve(result)));
    });

    const filename = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson.gz`;

    const stored = await storageService.uploadFile({
      tenantId: 'system',
      entityType: 'backup',
      entityId: 'nightly',
      file: gzipped,
      filename,
      mimeType: 'application/gzip',
    });

    monitoring.logInfo(`[BackupWorker] Backed up ${totalDocs} document(s) across ${collections.length} collection(s) -> ${stored.key}`);

    await auditLog.log({
      action: 'BACKUP_COMPLETED',
      userId: 'system',
      tenantId: 'system',
      entityType: 'backup',
      category: 'system',
      severity: 'info',
      metadata: { key: stored.key, size: stored.size, documentCount: totalDocs, collectionCount: collections.length },
    });
  }
}