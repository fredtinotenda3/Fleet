// modules/telematics/repositories/demo-state.repository.ts
//
// One document per tenant recording whether Demo Mode is on, and when
// it was turned on. `startedAt` is the seed for the deterministic
// motion function in ../demo/demo-simulator.service.ts -- every
// simulated vehicle's position is a pure function of (vehicle id,
// elapsed time since startedAt), so no per-tick state needs to be
// persisted for the map to animate correctly, including across
// serverless instances that don't share memory.

import { Db } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';

export interface TelematicsDemoState {
  tenantId: string;
  enabled: boolean;
  startedAt: Date;
  updatedAt: Date;
  updatedBy?: string;
}

export class DemoStateRepository {
  private collectionName = 'tbltelematics_demo_state';

  private async collection() {
    const db: Db = await connectToDatabase();
    return db.collection<TelematicsDemoState>(this.collectionName);
  }

  async getState(tenantId: string): Promise<TelematicsDemoState | null> {
    const collection = await this.collection();
    return collection.findOne({ tenantId });
  }

  async isEnabled(tenantId: string): Promise<boolean> {
    const state = await this.getState(tenantId);
    return state?.enabled ?? false;
  }

  async setEnabled(tenantId: string, enabled: boolean, userId: string): Promise<TelematicsDemoState> {
    const collection = await this.collection();
    const now = new Date();

    // Turning demo mode ON (from off, or for the first time) resets
    // startedAt so every vehicle's simulated route restarts from a
    // consistent point rather than jumping to wherever a stale elapsed-
    // time calculation would place it.
    const existing = await this.getState(tenantId);
    const startedAt = enabled && !existing?.enabled ? now : existing?.startedAt ?? now;

    await collection.updateOne(
      { tenantId },
      {
        $set: { tenantId, enabled, startedAt, updatedAt: now, updatedBy: userId },
      },
      { upsert: true }
    );

    return { tenantId, enabled, startedAt, updatedAt: now, updatedBy: userId };
  }
}

export const demoStateRepository = new DemoStateRepository();