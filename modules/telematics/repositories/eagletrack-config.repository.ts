// modules/telematics/repositories/eagletrack-config.repository.ts
//
// Stores the per-tenant Eagle Track integration config: the deployment
// domain and the static API token (encrypted at rest via
// EncryptionService -- the same primitive used for SSO client secrets,
// MFA TOTP secrets and Cartrack's API secret; see
// infrastructure/secrets/encryption.service.ts). No new crypto.
//
// One document per tenant (upsert on save), not org-unit scoped: an
// Eagle Track account is a whole-organization integration, not something
// that varies by branch/fleet/workshop. The telemetry it returns is then
// matched and scoped per vehicle as it is ingested (see
// eagletrack.adapter.ts), exactly as cartrack-config.repository.ts
// describes for Cartrack.
//
// UNLIKE CARTRACK there is no default domain. Eagle Track is a
// white-labelled platform deployed per customer/reseller, so there is no
// vendor-wide base URL to fall back to, and inventing one would point a
// tenant's credentials at somebody else's deployment.

import { Db } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { encryptionService } from '@/infrastructure/secrets/encryption.service';
import { EagleTrackConfig, EagleTrackUnmatchedTracker } from '../adapters/eagletrack/eagletrack.types';

export type EagleTrackConfigInput = {
  domain: string;
  token: string;
  enabled: boolean;
};

/** EagleTrackConfig with the token decrypted -- never persisted in this form, only handed to the API client at call time. */
export type EagleTrackConfigResolved = Omit<EagleTrackConfig, 'tokenEncrypted'> & { token: string };

export class EagleTrackConfigRepository {
  private collectionName = 'tbltelematics_eagletrack_config';

  private async collection() {
    const db: Db = await connectToDatabase();
    return db.collection<EagleTrackConfig>(this.collectionName);
  }

  async getConfig(tenantId: string): Promise<EagleTrackConfig | null> {
    const collection = await this.collection();
    return collection.findOne({ tenantId });
  }

  /** Decrypted variant for internal use (building the API client). Never expose `token` over an HTTP response. */
  async getResolvedConfig(tenantId: string): Promise<EagleTrackConfigResolved | null> {
    const config = await this.getConfig(tenantId);
    if (!config) return null;
    const { tokenEncrypted, ...rest } = config;
    return { ...rest, token: encryptionService.decrypt(tokenEncrypted) };
  }

  async upsertConfig(tenantId: string, input: EagleTrackConfigInput, userId: string): Promise<EagleTrackConfig> {
    const collection = await this.collection();
    const now = new Date();

    const update = {
      tenantId,
      enabled: input.enabled,
      domain: input.domain,
      tokenEncrypted: encryptionService.encrypt(input.token),
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
      throw new Error('Failed to persist Eagle Track configuration');
    }
    return saved;
  }

  /**
   * Records the outcome of one sync.
   *
   * `extra.unmatchedTrackers` is the snapshot the admin mapping screen
   * reads -- see EagleTrackUnmatchedTracker for why it lives on this
   * document rather than in a collection of its own. It is written only
   * when the caller supplies it, so the error paths that call this
   * method BEFORE the roster has been walked (a failed credential
   * check, an underivable username) leave the previous snapshot intact
   * rather than blanking the operator's worklist because one poll
   * failed.
   */
  async recordSyncResult(
    tenantId: string,
    status: 'success' | 'error',
    error?: string,
    extra?: { unmatchedTrackers?: EagleTrackUnmatchedTracker[] }
  ): Promise<void> {
    const collection = await this.collection();

    const update: Record<string, unknown> = {
      lastSyncAt: new Date(),
      lastSyncStatus: status,
      lastSyncError: error,
    };

    if (extra?.unmatchedTrackers) {
      update.lastUnmatchedTrackers = extra.unmatchedTrackers;
    }

    await collection.updateOne({ tenantId }, { $set: update });
  }

  /**
   * Stamps the roster-shaped sub-syncs' completion time.
   *
   * Separate from recordSyncResult because they run on a different
   * cadence (see SUB_SYNC_INTERVAL_MS) and a position poll must not
   * advance a driver-sync clock it did not act on -- that would make the
   * sub-syncs skip forever.
   */
  async recordSubSyncAt(
    tenantId: string,
    parts: { drivers?: boolean; triggers?: boolean }
  ): Promise<void> {
    const collection = await this.collection();
    const now = new Date();
    const update: Record<string, unknown> = {};
    if (parts.drivers) update.lastDriverSyncAt = now;
    if (parts.triggers) update.lastTriggerSyncAt = now;
    if (Object.keys(update).length === 0) return;

    await collection.updateOne({ tenantId }, { $set: update });
  }

  async setEnabled(tenantId: string, enabled: boolean, userId: string): Promise<boolean> {
    const collection = await this.collection();
    const result = await collection.updateOne(
      { tenantId },
      { $set: { enabled, updatedAt: new Date(), updatedBy: userId } }
    );
    return result.matchedCount > 0;
  }

  /** Every tenant with Eagle Track enabled -- used by the periodic sync job to know which tenants to poll. */
  async listEnabledTenantIds(): Promise<string[]> {
    const collection = await this.collection();
    const docs = await collection.find({ enabled: true }, { projection: { tenantId: 1 } }).toArray();
    return docs.map((d) => d.tenantId);
  }
}

export const eagletrackConfigRepository = new EagleTrackConfigRepository();
