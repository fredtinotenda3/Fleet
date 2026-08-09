// modules/telematics/repositories/cartrack-config.repository.ts
//
// Stores the per-tenant Cartrack integration config: account id, API
// key, and API secret (encrypted at rest via EncryptionService, the
// same primitive used for SSO client secrets and MFA TOTP secrets --
// see infrastructure/secrets/encryption.service.ts). One document per
// tenant (upsert on save), not org-unit scoped: the Cartrack account is
// a whole-organization integration, not something that varies by
// branch/fleet/workshop -- the vehicles it returns are then matched and
// scoped individually as they're ingested (see cartrack.adapter.ts).

import { Db } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { encryptionService } from '@/infrastructure/secrets/encryption.service';
import { CartrackConfig } from '../adapters/cartrack/cartrack.types';

export type CartrackConfigInput = {
  accountId: string;
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  enabled: boolean;
};

/** CartrackConfig with the secret decrypted -- never persisted, only handed to the API client at call time. */
export type CartrackConfigResolved = Omit<CartrackConfig, 'apiSecretEncrypted'> & { apiSecret: string };

export class CartrackConfigRepository {
  private collectionName = 'tbltelematics_cartrack_config';

  private async collection() {
    const db: Db = await connectToDatabase();
    return db.collection<CartrackConfig>(this.collectionName);
  }

  async getConfig(tenantId: string): Promise<CartrackConfig | null> {
    const collection = await this.collection();
    return collection.findOne({ tenantId });
  }

  /** Decrypted variant for internal use (building the API client). Never expose apiSecret over an HTTP response. */
  async getResolvedConfig(tenantId: string): Promise<CartrackConfigResolved | null> {
    const config = await this.getConfig(tenantId);
    if (!config) return null;
    const { apiSecretEncrypted, ...rest } = config;
    return { ...rest, apiSecret: encryptionService.decrypt(apiSecretEncrypted) };
  }

  async upsertConfig(tenantId: string, input: CartrackConfigInput, userId: string): Promise<CartrackConfig> {
    const collection = await this.collection();
    const now = new Date();

    const update = {
      tenantId,
      enabled: input.enabled,
      accountId: input.accountId,
      apiKey: input.apiKey,
      apiSecretEncrypted: encryptionService.encrypt(input.apiSecret),
      baseUrl: input.baseUrl,
      updatedAt: now,
      updatedBy: userId,
    };

    await collection.updateOne(
      { tenantId },
      {
        $set: update,
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );

    const saved = await collection.findOne({ tenantId });
    if (!saved) {
      throw new Error('Failed to persist Cartrack configuration');
    }
    return saved;
  }

  async recordSyncResult(tenantId: string, status: 'success' | 'error', error?: string): Promise<void> {
    const collection = await this.collection();
    await collection.updateOne(
      { tenantId },
      {
        $set: {
          lastSyncAt: new Date(),
          lastSyncStatus: status,
          lastSyncError: error,
        },
      }
    );
  }

  async setEnabled(tenantId: string, enabled: boolean, userId: string): Promise<boolean> {
    const collection = await this.collection();
    const result = await collection.updateOne(
      { tenantId },
      { $set: { enabled, updatedAt: new Date(), updatedBy: userId } }
    );
    return result.matchedCount > 0;
  }

  /** Every tenant with Cartrack enabled -- used by the periodic sync job to know which tenants to poll. */
  async listEnabledTenantIds(): Promise<string[]> {
    const collection = await this.collection();
    const docs = await collection.find({ enabled: true }, { projection: { tenantId: 1 } }).toArray();
    return docs.map((d) => d.tenantId);
  }
}

export const cartrackConfigRepository = new CartrackConfigRepository();