// modules/security/repositories/mfa.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { MfaFactor, MfaBackupCode } from '../types/mfa.types';

export class MfaFactorRepository extends BaseRepository<MfaFactor> {
  protected collectionName = 'tblmfafactors';

  async findVerifiedByUser(userId: string, tenantId: string): Promise<MfaFactor | null> {
    return this.findOne({ userId, status: 'verified' } as Filter<MfaFactor>, tenantId, false, true);
  }

  async findPendingByUser(userId: string, tenantId: string): Promise<MfaFactor | null> {
    return this.findOne({ userId, status: 'pending' } as Filter<MfaFactor>, tenantId, false, true);
  }

  async deleteAllForUser(userId: string, tenantId: string): Promise<void> {
    const collection = await this.getCollection();
    await collection.deleteMany({ ...this.getActiveFilter(tenantId, true, true), userId } as Filter<MfaFactor>);
  }

  async markVerified(id: string, tenantId: string): Promise<MfaFactor | null> {
    return this.update(id, { status: 'verified', verifiedAt: new Date() }, tenantId, undefined, true);
  }

  async touchLastUsed(id: string, tenantId: string): Promise<void> {
    await this.update(id, { lastUsedAt: new Date() }, tenantId, undefined, true);
  }
}

/**
 * Backup codes are stored separately from BaseRepository's tenant-scoped
 * model since they're keyed purely by userId (a user's MFA identity is
 * global to their account, not per-organization) and need bulk
 * insert/consume operations BaseRepository doesn't expose.
 */
export class MfaBackupCodeRepository {
  private readonly collectionName = 'tblmfabackupcodes';

  private async getCollection() {
    const db = await connectToDatabase();
    return db.collection<MfaBackupCode>(this.collectionName);
  }

  async replaceAllForUser(userId: string, tenantId: string, codeHashes: string[]): Promise<void> {
    const collection = await this.getCollection();
    await collection.deleteMany({ userId });
    if (codeHashes.length === 0) return;

    const now = new Date();
    await collection.insertMany(
      codeHashes.map((codeHash) => ({
        tenantId,
        userId,
        codeHash,
        used: false,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      })) as any[]
    );
  }

  async findUnusedByUser(userId: string): Promise<MfaBackupCode[]> {
    const collection = await this.getCollection();
    return collection.find({ userId, used: false }).toArray();
  }

  async consume(id: string): Promise<boolean> {
    const collection = await this.getCollection();
    const { ObjectId } = await import('mongodb');
    if (!ObjectId.isValid(id)) return false;
    const result = await collection.updateOne(
      { _id: new ObjectId(id) as any, used: false },
      { $set: { used: true, usedAt: new Date() } }
    );
    return result.modifiedCount > 0;
  }

  async deleteAllForUser(userId: string): Promise<void> {
    const collection = await this.getCollection();
    await collection.deleteMany({ userId });
  }

  async countUnusedByUser(userId: string): Promise<number> {
    const collection = await this.getCollection();
    return collection.countDocuments({ userId, used: false });
  }
}

export const mfaFactorRepository = new MfaFactorRepository();
export const mfaBackupCodeRepository = new MfaBackupCodeRepository();