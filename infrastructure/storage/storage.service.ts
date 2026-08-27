// infrastructure/storage/storage.service.ts

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { monitoring } from '@/infrastructure/monitoring/logger';

export interface UploadStreamOptions {
  tenantId: string;
  entityType: string;
  entityId: string;
  /** Absolute path to a file already on disk. */
  sourcePath: string;
  filename: string;
  mimeType: string;
}

export interface UploadOptions {
  tenantId: string;
  entityType: string;
  entityId: string;
  file: Buffer;
  filename: string;
  mimeType: string;
  resize?: { width: number; height: number };
}

export interface StoredFile {
  id: string;
  key: string;
  url: string;
  thumbnailUrl?: string;
  size: number;
  mimeType: string;
  filename: string;
}

export class StorageService {
  private s3Client: S3Client;
  private bucket: string;
  upload: any;

  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    this.bucket = process.env.S3_BUCKET || 'fleet-storage';
  }

  /**
   * PHASE 4, F-20: uploads a file already on disk, without reading it
   * into memory first.
   *
   * `uploadFile` below takes a Buffer, which is fine for the logos and
   * documents it was built for and impossible for a full database
   * backup. This streams from disk instead: peak memory is the S3
   * client's socket buffer, not the file size.
   *
   * `ContentLength` comes from `fstat` because a plain PutObject with a
   * stream body and no declared length fails in the AWS SDK -- it cannot
   * sign a request whose size it does not know. Multipart upload
   * (@aws-sdk/lib-storage) would avoid the stat, but is not a dependency
   * of this project and adding an SDK package for a nightly backup is a
   * larger change than the defect warrants.
   *
   * Deliberately kept on StorageService rather than letting the backup
   * worker talk to S3 directly: the storage boundary is what keeps
   * bucket, key layout and credentials in one place.
   */
  async uploadStream(options: UploadStreamOptions): Promise<StoredFile> {
    const { createReadStream } = await import('fs');
    const { stat } = await import('fs/promises');

    const fileId = randomUUID();
    const key = this.buildKey(
      options.tenantId,
      options.entityType,
      options.entityId,
      fileId,
      options.filename
    );

    const { size } = await stat(options.sourcePath);

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(options.sourcePath),
        ContentLength: size,
        ContentType: options.mimeType,
        Metadata: {
          tenantId: options.tenantId,
          entityType: options.entityType,
          entityId: options.entityId,
          originalName: options.filename,
        },
      })
    );

    return {
      id: fileId,
      key,
      // Signed like every other stored file, so a backup archive is not
      // publicly readable by virtue of knowing its key.
      url: await this.getSignedUrl(key),
      size,
      mimeType: options.mimeType,
      filename: options.filename,
    };
  }

  async uploadFile(options: UploadOptions): Promise<StoredFile> {
    const startTime = Date.now();
    const fileId = randomUUID();
    const key = this.buildKey(options.tenantId, options.entityType, options.entityId, fileId, options.filename);
    
    let fileBuffer = options.file;
    let thumbnailBuffer: Buffer | null = null;
    
    // Resize image if needed and it's an image
    if (options.resize && options.mimeType.startsWith('image/')) {
      fileBuffer = await sharp(fileBuffer)
        .resize(options.resize.width, options.resize.height, { fit: 'inside' })
        .toBuffer();
      
      thumbnailBuffer = await sharp(options.file)
        .resize(200, 200, { fit: 'cover' })
        .toBuffer();
    }
    
    // Upload original
    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: options.mimeType,
      Metadata: {
        tenantId: options.tenantId,
        entityType: options.entityType,
        entityId: options.entityId,
        originalName: options.filename,
      },
    }));
    
    // Upload thumbnail if available
    let thumbnailKey: string | undefined;
    if (thumbnailBuffer) {
      thumbnailKey = `thumbnails/${key}`;
      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: 'image/jpeg',
      }));
    }
    
    const duration = Date.now() - startTime;
    await monitoring.trackMetric('storage.upload.duration', duration, { entityType: options.entityType });
    
    return {
      id: fileId,
      key,
      url: await this.getSignedUrl(key),
      thumbnailUrl: thumbnailKey ? await this.getSignedUrl(thumbnailKey) : undefined,
      size: fileBuffer.length,
      mimeType: options.mimeType,
      filename: options.filename,
    };
  }

  async getFile(key: string): Promise<Buffer | null> {
    try {
      const response = await this.s3Client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
      
      return Buffer.from(await response.Body!.transformToByteArray());
    } catch (error) {
      monitoring.logError('Storage get file failed', error as Error, { key });
      return null;
    }
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    
    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async deleteFile(key: string): Promise<void> {
    await this.s3Client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
  }

  async deleteFilesByPrefix(prefix: string): Promise<void> {
    // Implementation would list and delete all objects with prefix
    monitoring.logInfo(`Deleting files with prefix: ${prefix}`);
  }

  private buildKey(tenantId: string, entityType: string, entityId: string, fileId: string, filename: string): string {
    const extension = filename.split('.').pop();
    return `${tenantId}/${entityType}/${entityId}/${fileId}.${extension}`;
  }
}

export const storageService = new StorageService();