// frontend/modules/telematics/components/CartrackConfigSection.tsx
//
// Cartrack integration card for Organization Settings -> Integrations.
// Talks only to the existing GET/PUT /api/telematics/cartrack/config and
// POST /api/telematics/cartrack/test-connection routes (via
// useCartrackConfig) -- gated ORG_SETTINGS server-side, same as every
// other tab on this page. No new persistence mechanism.
//
// SECRET HANDLING: GET /config never returns apiSecret or
// apiSecretEncrypted (see cartrack.controller.ts / the security test at
// tests/security/telematics-cartrack-config-gating.spec.ts), so this
// form never has the real secret to pre-fill. The password field always
// starts blank; a configured tenant instead sees a "•••••••••••• saved"
// indicator next to it. Because PUT requires apiSecret on every call
// (shared/validations/cartrack.schema.ts has no partial-update path),
// saving ANY change -- including just flipping Enabled -- requires
// re-entering the secret. That's a real backend-contract constraint,
// not a frontend choice; see the REMAINING GAPS note in the delivery
// report. The field is never written to localStorage/sessionStorage,
// never logged, and is cleared from React state right after a successful
// save: the save response updates the cached config, the effect below
// (keyed on `config`) picks up the new object and reset()s the form with
// apiSecret: '', so no successful save leaves the typed secret sitting
// in form state.

'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Switch } from '@/frontend/shared/ui/forms/switch';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Alert, AlertDescription } from '@/frontend/shared/ui/feedback/alert';
import { useCartrackConfig } from '../hooks/useCartrackConfig';
import { cartrackConfigFormSchema, type CartrackConfigFormValues } from '../schemas/cartrack.schema';

function formatTimestamp(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

/**
 * Status badge is derived ONLY from fields the backend actually returns
 * (configured/enabled/lastSyncStatus) -- never from "configured && enabled"
 * alone, which would just mean credentials exist and are turned on, not
 * that they work. `lastSyncStatus` comes from cartrackAdapter.syncOrganization
 * recording a real fleet-status pull, so "Connected" here reflects the
 * last actual outcome against Cartrack, not a frontend guess. It is NOT
 * set by the Test Connection button (that result is shown separately,
 * below, and isn't persisted).
 */
type CartrackStatus = 'not-configured' | 'disabled' | 'connected' | 'sync-error' | 'awaiting-sync';

function deriveStatus(config?: { configured: boolean; enabled: boolean; lastSyncStatus?: 'success' | 'error' }): CartrackStatus {
  if (!config?.configured) return 'not-configured';
  if (!config.enabled) return 'disabled';
  if (config.lastSyncStatus === 'success') return 'connected';
  if (config.lastSyncStatus === 'error') return 'sync-error';
  return 'awaiting-sync';
}

const STATUS_DISPLAY: Record<CartrackStatus, { label: string; badgeVariant: 'default' | 'secondary' | 'outline' | 'destructive'; dotClass: string }> = {
  'not-configured': { label: 'Not configured', badgeVariant: 'outline', dotClass: 'bg-muted-foreground' },
  disabled: { label: 'Disabled', badgeVariant: 'secondary', dotClass: 'bg-muted-foreground' },
  connected: { label: 'Connected', badgeVariant: 'default', dotClass: 'bg-success' },
  'sync-error': { label: 'Sync failing', badgeVariant: 'destructive', dotClass: 'bg-destructive' },
  'awaiting-sync': { label: 'Enabled — awaiting first sync', badgeVariant: 'secondary', dotClass: 'bg-muted-foreground' },
};

export function CartrackConfigSection() {
  const { data: config, isLoading, isError, save, testConnection } = useCartrackConfig();
  const [showSecret, setShowSecret] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isDirty },
  } = useForm<CartrackConfigFormValues>({
    resolver: zodResolver(cartrackConfigFormSchema),
    defaultValues: {
      enabled: false,
      accountId: '',
      apiKey: '',
      apiSecret: '',
      baseUrl: 'https://fleetapi.cartrack.com',
    },
  });

  // Re-sync the form whenever fresh config arrives (initial load, or after
  // a save's refetch) -- apiSecret is deliberately left blank; see the
  // file-level comment above.
  useEffect(() => {
    if (!config) return;
    reset({
      enabled: config.enabled,
      accountId: config.accountId ?? '',
      apiKey: config.apiKey ?? '',
      apiSecret: '',
      baseUrl: config.baseUrl ?? 'https://fleetapi.cartrack.com',
    });
  }, [config, reset]);

  const onSubmit = (data: CartrackConfigFormValues) => {
    save.mutate(data, {
      onSuccess: () => setShowSecret(false),
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
        <AlertDescription>Couldn&apos;t load the Cartrack configuration. Try refreshing the page.</AlertDescription>
      </Alert>
    );
  }

  const lastSyncAt = formatTimestamp(config?.lastSyncAt);
  const status = STATUS_DISPLAY[deriveStatus(config)];

  return (
    <div className="space-y-4 max-w-form-wide">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-h3">Cartrack</h3>
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
            <Label htmlFor="cartrack-enabled" className="form-label mb-0.5!">
              Enabled
            </Label>
            <p className="form-hint mt-0!">Turn the Cartrack integration on or off for this organization.</p>
          </div>
          <Controller
            control={control}
            name="enabled"
            render={({ field }) => (
              <Switch id="cartrack-enabled" checked={field.value} onCheckedChange={field.onChange} />
            )}
          />
        </div>

        <div>
          <Label htmlFor="cartrack-baseUrl" className="form-label form-required">
            API base URL
          </Label>
          <Input
            id="cartrack-baseUrl"
            className="input-base"
            placeholder="https://fleetapi.cartrack.com"
            autoComplete="off"
            {...register('baseUrl')}
          />
          {errors.baseUrl && <p className="form-error">{errors.baseUrl.message}</p>}
        </div>

        <div>
          <Label htmlFor="cartrack-accountId" className="form-label form-required">
            Account ID
          </Label>
          <Input
            id="cartrack-accountId"
            className="input-base"
            autoComplete="off"
            {...register('accountId')}
          />
          {errors.accountId && <p className="form-error">{errors.accountId.message}</p>}
        </div>

        <div>
          <Label htmlFor="cartrack-apiKey" className="form-label form-required">
            API key
          </Label>
          <Input id="cartrack-apiKey" className="input-base" autoComplete="off" {...register('apiKey')} />
          {errors.apiKey && <p className="form-error">{errors.apiKey.message}</p>}
        </div>

        <div>
          <Label htmlFor="cartrack-apiSecret" className="form-label form-required">
            API secret
          </Label>
          <div className="relative">
            <Input
              id="cartrack-apiSecret"
              type={showSecret ? 'text' : 'password'}
              className="pr-9 input-base"
              autoComplete="new-password"
              placeholder={config?.configured ? '•••••••••••• (enter to replace)' : 'Enter API secret'}
              {...register('apiSecret')}
            />
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              className="absolute -translate-y-1/2 right-2 top-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showSecret ? 'Hide API secret' : 'Show API secret'}
              aria-pressed={showSecret}
            >
              {showSecret ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
            </button>
          </div>
          {errors.apiSecret && <p className="form-error">{errors.apiSecret.message}</p>}
          <p className="form-hint">
            {config?.configured
              ? 'A secret is already saved. Re-enter it (or a new one) to save any change — the API never returns it, so the field can\'t be pre-filled.'
              : 'Stored encrypted. Never displayed once saved.'}
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
            {testConnection.data.connected ? (
              <CheckCircle2 aria-hidden="true" />
            ) : (
              <XCircle aria-hidden="true" />
            )}
            <AlertDescription>
              {testConnection.data.connected
                ? 'Connection successful — Cartrack API responded successfully.'
                : 'Connection failed — check the API URL and credentials.'}
            </AlertDescription>
          </Alert>
        )}
      </form>

      <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
        Credentials are encrypted at rest and never returned to the browser once saved.
      </p>
    </div>
  );
}
