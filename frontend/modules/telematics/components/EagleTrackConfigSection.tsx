// frontend/modules/telematics/components/EagleTrackConfigSection.tsx
//
// Eagle Track integration card for Organization Settings ->
// Integrations, rendered alongside CartrackConfigSection. Talks only to
// the existing GET/PUT /api/telematics/eagletrack/config and POST
// /api/telematics/eagletrack/test-connection routes (via
// useEagleTrackConfig) -- gated ORG_SETTINGS server-side, same as every
// other tab on this page. No new persistence mechanism.
//
// TOKEN HANDLING: GET /config never returns the token or its ciphertext
// (see eagletrack.controller.ts and the security test at
// tests/security/telematics-eagletrack-config-gating.spec.ts), so this
// form never has the real token to pre-fill. The password field always
// starts blank; a configured tenant sees a saved-token indicator
// instead. Because PUT requires `token` on every call
// (shared/validations/eagletrack.schema.ts has no partial-update path),
// saving ANY change -- including just flipping Enabled -- requires
// re-entering it. That is a backend-contract constraint, not a frontend
// choice. The field is never written to localStorage/sessionStorage,
// never logged, and is cleared from React state right after a successful
// save: the save response updates the cached config, the effect below
// (keyed on `config`) picks up the new object and reset()s the form with
// token: ''.
//
// http WARNING: the backend deliberately accepts a plain-http domain
// because real Eagle Track deployments run without TLS and rejecting
// them would make the integration unusable. The warning is now stronger
// than it was: the platform only authenticates a token supplied as a URL
// QUERY PARAMETER (see eagletrack-api.client.ts), so the credential is
// part of the request line. On http that is readable by anyone on the
// path, and on either scheme it lands in the vendor's own web-server
// access log -- hence the inline warning rather than silent acceptance.

'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Switch } from '@/frontend/shared/ui/forms/switch';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Alert, AlertDescription } from '@/frontend/shared/ui/feedback/alert';
import { useEagleTrackConfig } from '../hooks/useEagleTrackConfig';
import {
  eagletrackConfigFormSchema,
  isInsecureDomain,
  type EagleTrackConfigFormValues,
} from '../schemas/eagletrack.schema';

function formatTimestamp(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

/**
 * Derived only from fields the backend actually returns
 * (configured/enabled/lastSyncStatus) -- never from "configured &&
 * enabled" alone, which would mean credentials exist and are switched
 * on, not that they work. `lastSyncStatus` comes from
 * eagletrackAdapter.syncOrganization recording a real fleet pull, so
 * "Connected" reflects the last actual outcome. It is NOT set by the
 * Test Connection button (that result is shown separately and is not
 * persisted).
 */
type EagleTrackStatus = 'not-configured' | 'disabled' | 'connected' | 'sync-error' | 'awaiting-sync';

function deriveStatus(config?: {
  configured: boolean;
  enabled: boolean;
  lastSyncStatus?: 'success' | 'error';
}): EagleTrackStatus {
  if (!config?.configured) return 'not-configured';
  if (!config.enabled) return 'disabled';
  if (config.lastSyncStatus === 'success') return 'connected';
  if (config.lastSyncStatus === 'error') return 'sync-error';
  return 'awaiting-sync';
}

const STATUS_DISPLAY: Record<
  EagleTrackStatus,
  { label: string; badgeVariant: 'default' | 'secondary' | 'outline' | 'destructive'; dotClass: string }
> = {
  'not-configured': { label: 'Not configured', badgeVariant: 'outline', dotClass: 'bg-muted-foreground' },
  disabled: { label: 'Disabled', badgeVariant: 'secondary', dotClass: 'bg-muted-foreground' },
  connected: { label: 'Connected', badgeVariant: 'default', dotClass: 'bg-success' },
  'sync-error': { label: 'Sync failing', badgeVariant: 'destructive', dotClass: 'bg-destructive' },
  'awaiting-sync': { label: 'Enabled — awaiting first sync', badgeVariant: 'secondary', dotClass: 'bg-muted-foreground' },
};

export function EagleTrackConfigSection() {
  const { data: config, isLoading, isError, save, testConnection } = useEagleTrackConfig();
  const [showToken, setShowToken] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isDirty },
  } = useForm<EagleTrackConfigFormValues>({
    resolver: zodResolver(eagletrackConfigFormSchema),
    defaultValues: {
      enabled: false,
      // No default domain: Eagle Track is deployed per customer, so
      // pre-filling a vendor URL would be a guess. See the schema.
      domain: '',
      token: '',
    },
  });

  const domain = useWatch({ control, name: 'domain' });

  // Re-sync the form whenever fresh config arrives (initial load, or
  // after a save) -- token deliberately left blank; see the file header.
  useEffect(() => {
    if (!config) return;
    reset({
      enabled: config.enabled,
      domain: config.domain ?? '',
      token: '',
    });
  }, [config, reset]);

  const onSubmit = (data: EagleTrackConfigFormValues) => {
    save.mutate(data, {
      onSuccess: () => setShowToken(false),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-2" aria-live="polite" aria-busy="true">
        <div className="h-24 skeleton" />
        <div className="h-8 skeleton w-48" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <XCircle aria-hidden="true" />
        <AlertDescription>
          Couldn&apos;t load the Eagle Track configuration. Try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  const lastSyncAt = formatTimestamp(config?.lastSyncAt);
  const status = STATUS_DISPLAY[deriveStatus(config)];
  const insecure = isInsecureDomain(domain);

  return (
    <div className="space-y-4 max-w-form-wide">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-h3">Eagle Track</h3>
          <p className="text-body-sm text-muted-foreground">Real-time vehicle telemetry integration.</p>
        </div>
        <Badge variant={status.badgeVariant} className="gap-1">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${status.dotClass}`} aria-hidden="true" />
          {status.label}
        </Badge>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="form-section">
        <div className="flex items-center justify-between p-3 border rounded-md border-border">
          <div>
            <Label htmlFor="eagletrack-enabled" className="form-label mb-0.5!">
              Enabled
            </Label>
            <p className="form-hint mt-0!">Turn the Eagle Track integration on or off for this organization.</p>
          </div>
          <Controller
            control={control}
            name="enabled"
            render={({ field }) => (
              <Switch id="eagletrack-enabled" checked={field.value} onCheckedChange={field.onChange} />
            )}
          />
        </div>

        <div>
          <Label htmlFor="eagletrack-domain" className="form-label form-required">
            Platform domain
          </Label>
          <Input
            id="eagletrack-domain"
            className="input-base"
            placeholder="https://gps.example.com"
            autoComplete="off"
            {...register('domain')}
          />
          {errors.domain && <p className="form-error">{errors.domain.message}</p>}
          <p className="form-hint">
            The base URL of your Eagle Track deployment — no <code>/api2</code> suffix needed. Each customer runs
            their own instance, so there is no default.
          </p>
        </div>

        {insecure && (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>
              This domain uses <strong>http</strong>, not https. Eagle Track only accepts the API token in the
              request URL, so on http it is readable by anyone on the network path. Use https if your Eagle Track
              deployment supports it, and treat the token as rotatable either way.
            </AlertDescription>
          </Alert>
        )}

        <div>
          <Label htmlFor="eagletrack-token" className="form-label form-required">
            API token
          </Label>
          <div className="relative">
            <Input
              id="eagletrack-token"
              type={showToken ? 'text' : 'password'}
              className="pr-9 input-base"
              autoComplete="new-password"
              placeholder={config?.configured ? '•••••••••••• (enter to replace)' : 'Enter API token'}
              {...register('token')}
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute -translate-y-1/2 right-2 top-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showToken ? 'Hide API token' : 'Show API token'}
              aria-pressed={showToken}
            >
              {showToken ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
            </button>
          </div>
          {errors.token && <p className="form-error">{errors.token.message}</p>}
          <p className="form-hint">
            {config?.configured
              ? 'A token is already saved. Re-enter it (or a new one) to save any change — the API never returns it, so the field can\'t be pre-filled.'
              : 'Generated in Eagle Track under Settings → API Tokens. Stored encrypted. Never displayed once saved.'}
          </p>
        </div>

        {(lastSyncAt || config?.lastSyncStatus) && (
          <div className="text-caption text-muted-foreground">
            {lastSyncAt && <p>Last sync: {lastSyncAt}</p>}
            {config?.lastSyncStatus === 'error' && config.lastSyncError && (
              <p className="text-destructive">Last sync error: {config.lastSyncError}</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!config?.configured || isDirty || testConnection.isPending}
            onClick={() => testConnection.mutate()}
          >
            {testConnection.isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Testing…
              </>
            ) : (
              'Test connection'
            )}
          </Button>
          <Button type="submit" disabled={!isDirty || save.isPending}>
            {save.isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Saving…
              </>
            ) : (
              'Save'
            )}
          </Button>
          {!config?.configured ? null : isDirty ? (
            <span className="text-caption text-muted-foreground">Save your changes to test the new connection.</span>
          ) : null}
        </div>

        {testConnection.data && (
          <Alert variant={testConnection.data.connected ? 'default' : 'destructive'}>
            {testConnection.data.connected ? <CheckCircle2 aria-hidden="true" /> : <XCircle aria-hidden="true" />}
            <AlertDescription>
              {testConnection.data.connected
                ? 'Connection successful — Eagle Track responded successfully.'
                : 'Connection failed — check the domain and API token.'}
            </AlertDescription>
          </Alert>
        )}
      </form>

      <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
        Credentials are encrypted at rest and never returned to the browser once saved.
      </p>

      <p className="text-caption text-muted-foreground">
        Vehicles are matched to Eagle Track trackers by licence plate, tried in order: the tracker&apos;s{' '}
        <code>plate</code> field, then <code>__platenumber</code>, then its <code>name</code>. Most deployments leave
        the first two blank and carry the plate in the tracker name. Each candidate must match one of your vehicle
        plates exactly — nothing is guessed at, and trackers that match nothing are reported as unmatched by each sync.
        Check the sync result if a vehicle is missing from the live map.
      </p>
    </div>
  );
}
