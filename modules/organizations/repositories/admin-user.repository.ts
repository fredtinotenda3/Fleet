// modules/organizations/repositories/admin-user.repository.ts
//
// Minimal, purpose-built repository over the `tbladmin` collection —
// the same collection lib/authOptions.ts authenticates against. This is
// intentionally NOT a full BaseRepository<T> subclass: tbladmin predates
// the BaseEntity/tenantId-scoping conventions (its "tenant scoping" is
// literally the tenantId field checked at login, not a query filter),
// and its field casing (Email/Password/FirstName/Role, capitalized) is
// legacy and shouldn't be normalized here — that's a separate migration,
// not something to sneak into the Organization module.

import { ObjectId } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';

export interface AdminUserDoc {
  _id?: ObjectId;
  Email: string;
  Password: string;
  FirstName: string;
  Role?: string;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class AdminUserRepository {
  private async getCollection() {
    const db = await connectToDatabase();
    return db.collection<AdminUserDoc>('tbladmin');
  }

  async findByEmail(email: string): Promise<AdminUserDoc | null> {
    const collection = await this.getCollection();
    return collection.findOne({ Email: email.toLowerCase() });
  }

  async findById(id: string): Promise<AdminUserDoc | null> {
    if (!ObjectId.isValid(id)) return null;
    const collection = await this.getCollection();
    return collection.findOne({ _id: new ObjectId(id) });
  }

  async create(
    data: Omit<AdminUserDoc, '_id' | 'createdAt' | 'updatedAt'>
  ): Promise<AdminUserDoc & { _id: ObjectId }> {
    const collection = await this.getCollection();
    const now = new Date();
    const doc: AdminUserDoc = {
      ...data,
      Email: data.Email.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    };
    const result = await collection.insertOne(doc);
    return { ...doc, _id: result.insertedId };
  }
}

export const adminUserRepository = new AdminUserRepository();