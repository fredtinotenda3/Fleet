// infrastructure/secrets/secrets-manager.service.ts

/**
 * Thin abstraction over "where do platform secrets come from". Defaults
 * to environment variables; can be pointed at AWS Secrets Manager (or
 * any future provider) purely by setting SECRETS_PROVIDER=aws, with no
 * call-site changes required elsewhere in the codebase.
 *
 * This does NOT replace EncryptionService — that handles envelope
 * encryption of application data (TOTP secrets, OIDC client secrets)
 * at rest in MongoDB. SecretsManagerService is for the platform's own
 * bootstrap secrets (e.g. rotating SECRETS_ENCRYPTION_KEY itself,
 * third-party API credentials) that shouldn't live in plain env files
 * in a hardened deployment.
 */

export interface SecretsProvider {
  getSecret(name: string): Promise<string | null>;
}

class EnvSecretsProvider implements SecretsProvider {
  async getSecret(name: string): Promise<string | null> {
    return process.env[name] ?? null;
  }
}

/**
 * Lazily imports @aws-sdk/client-secrets-manager only when actually
 * selected, so the dependency stays optional and the app still boots
 * without it in environments that don't need it.
 */
class AwsSecretsManagerProvider implements SecretsProvider {
  private clientPromise: Promise<any> | null = null;

  private async getClient(): Promise<any> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const { SecretsManagerClient } = await import('@aws-sdk/client-secrets-manager');
        return new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
      })();
    }
    return this.clientPromise;
  }

  async getSecret(name: string): Promise<string | null> {
    try {
      const { GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
      const client = await this.getClient();
      const result = await client.send(new GetSecretValueCommand({ SecretId: name }));
      return result.SecretString ?? null;
    } catch (error) {
      console.error(`[SecretsManager] Failed to fetch secret "${name}" from AWS:`, error);
      return null;
    }
  }
}

const CACHE_TTL_MS = 5 * 60 * 1000;

export class SecretsManagerService {
  private provider: SecretsProvider;
  private cache = new Map<string, { value: string | null; expiresAt: number }>();

  constructor() {
    this.provider =
      process.env.SECRETS_PROVIDER === 'aws' ? new AwsSecretsManagerProvider() : new EnvSecretsProvider();
  }

  async getSecret(name: string): Promise<string | null> {
    const cached = this.cache.get(name);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    const value = await this.provider.getSecret(name);
    this.cache.set(name, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  invalidate(name: string): void {
    this.cache.delete(name);
  }
}

export const secretsManager = new SecretsManagerService();