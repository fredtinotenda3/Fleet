// modules/security/repositories/login-attempt.repository.ts

import connectToDatabase from '@/infrastructure/database/mongodb';
import { LoginAttemptRecord, AccountLockout } from '../types/threat-detection.types';

const ATTEMPTS_COLLECTION = 'tblloginattempts';
const LOCKOUTS_COLLECTION = 'tblaccountlockouts';

export class LoginAttemptRepository {
  private async attempts() {
    const db = await connectToDatabase();
    return db.collection<LoginAttemptRecord>(ATTEMPTS_COLLECTION);
  }

  private async lockouts() {
    const db = await connectToDatabase();
    return db.collection<AccountLockout>(LOCKOUTS_COLLECTION);
  }

  async recordAttempt(record: LoginAttemptRecord): Promise<void> {
    const collection = await this.attempts();
    await collection.insertOne(record as any);
  }

  async getRecentFailedCount(email: string, tenantId: string, sinceMs: number): Promise<number> {
    const collection = await this.attempts();
    const since = new Date(Date.now() - sinceMs);
    return collection.countDocuments({
      email: email.toLowerCase(),
      tenantId,
      success: false,
      attemptedAt: { $gte: since },
    });
  }

  async getLockout(email: string, tenantId: string): Promise<AccountLockout | null> {
    const collection = await this.lockouts();
    return collection.findOne({ email: email.toLowerCase(), tenantId });
  }

  async upsertLockout(
    email: string,
    tenantId: string,
    fields: Partial<Omit<AccountLockout, '_id' | 'email' | 'tenantId'>>
  ): Promise<void> {
    const collection = await this.lockouts();
    await collection.updateOne(
      { email: email.toLowerCase(), tenantId },
      { $set: { ...fields, updatedAt: new Date() } },
      { upsert: true }
    );
  }

  async clearLockout(email: string, tenantId: string): Promise<void> {
    const collection = await this.lockouts();
    await collection.updateOne(
      { email: email.toLowerCase(), tenantId },
      { $set: { failedCount: 0, lockedUntil: null, updatedAt: new Date() } },
      { upsert: true }
    );
  }

  async listLockedAccounts(tenantId?: string): Promise<AccountLockout[]> {
    const collection = await this.lockouts();
    const filter: Record<string, unknown> = { lockedUntil: { $ne: null, $gt: new Date() } };
    if (tenantId) filter.tenantId = tenantId;
    return collection.find(filter).sort({ updatedAt: -1 }).toArray();
  }
}

export const loginAttemptRepository = new LoginAttemptRepository();