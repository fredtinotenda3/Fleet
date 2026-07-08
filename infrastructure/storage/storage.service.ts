// infrastructure/storage/storage.service.ts

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { monitoring } from '@/infrastructure/monitoring/logger';

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