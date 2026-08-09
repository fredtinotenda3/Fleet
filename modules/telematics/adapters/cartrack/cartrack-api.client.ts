// modules/telematics/adapters/cartrack/cartrack-api.client.ts
//
// Thin HTTP client for Cartrack's Fleet API. Deliberately has no
// knowledge of tenants, vehicles, or our own data model -- it only
// knows how to authenticate and fetch/parse Cartrack's wire format.
// modules/telematics/adapters/cartrack/cartrack.adapter.ts is the layer
// that maps this onto our TelematicsData ingest pipeline.

import { CartrackVehicleStatus, CartrackVehicleStatusResponse } from './cartrack.types';

export class CartrackApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'CartrackApiError';
  }
}

export interface CartrackApiClientConfig {
  baseUrl: string;
  accountId: string;
  apiKey: string;
  apiSecret: string;
  /** Request timeout in ms. Defaults to 15s so a slow/hanging Cartrack response can't stall a sync job indefinitely. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export class CartrackApiClient {
  private readonly baseUrl: string;
  private readonly accountId: string;
  private readonly authHeader: string;
  private readonly timeoutMs: number;

  constructor(config: CartrackApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.accountId = config.accountId;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    // Cartrack's Fleet API authenticates with HTTP Basic auth using the
    // API key/secret pair issued per integration.
    this.authHeader = 'Basic ' + Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64');
  }

  /**
   * Fetches the current status (position, ignition, fuel, recent
   * events) for every vehicle Cartrack has on file for this account.
   * One call covers the whole fleet -- Cartrack's API is designed
   * around fleet-wide polling rather than per-vehicle requests, which
   * is also why this is the shape the periodic sync job calls.
   */
  async getFleetStatus(): Promise<CartrackVehicleStatus[]> {
    const response = await this.request<CartrackVehicleStatusResponse>(
      `/rest/2/${encodeURIComponent(this.accountId)}/vehicles/status`
    );
    return response.data ?? [];
  }

  /** Status for a single vehicle by Cartrack terminal serial, used for on-demand refreshes from the UI. */
  async getVehicleStatus(terminalSerial: string): Promise<CartrackVehicleStatus | null> {
    try {
      return await this.request<CartrackVehicleStatus>(
        `/rest/2/${encodeURIComponent(this.accountId)}/vehicles/${encodeURIComponent(terminalSerial)}/status`
      );
    } catch (error) {
      if (error instanceof CartrackApiError && error.statusCode === 404) return null;
      throw error;
    }
  }

  /** Verifies the stored credentials actually authenticate, without pulling a full fleet payload. Used by the config save/test-connection endpoint. */
  async verifyCredentials(): Promise<boolean> {
    try {
      await this.request(`/rest/2/${encodeURIComponent(this.accountId)}/vehicles`, { method: 'HEAD' });
      return true;
    } catch (error) {
      if (error instanceof CartrackApiError && (error.statusCode === 401 || error.statusCode === 403)) {
        return false;
      }
      // A transient network/5xx error isn't a credentials problem --
      // surface it rather than reporting invalid credentials.
      throw error;
    }
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
          ...init.headers,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new CartrackApiError(
          `Cartrack API request failed: ${response.status} ${response.statusText}`,
          response.status,
          body
        );
      }

      if (init.method === 'HEAD') {
        return undefined as unknown as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof CartrackApiError) throw error;
      if ((error as { name?: string })?.name === 'AbortError') {
        throw new CartrackApiError(`Cartrack API request timed out after ${this.timeoutMs}ms`, undefined, error);
      }
      throw new CartrackApiError('Cartrack API request failed', undefined, error);
    } finally {
      clearTimeout(timeout);
    }
  }
}