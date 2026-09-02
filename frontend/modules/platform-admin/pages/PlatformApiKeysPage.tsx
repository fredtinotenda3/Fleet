// frontend/modules/platform-admin/pages/PlatformApiKeysPage.tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Info, KeyRound, Plus, RefreshCw } from 'lucide-react';

import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { Permission, permissionService } from '@/server/permissions/roles';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '@/frontend/shared/ui/feedback/alert';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Checkbox } from '@/frontend/shared/ui/forms/checkbox';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';

import { useApiKeys, useCreateApiKey, usePermissionDefinitions, useRevokeApiKey } from '../hooks';
import { ApiKeyTable } from '../components/ApiKeyTable';
import { ApiKeyForm } from '../components/ApiKeyForm';
import { effectiveApiKeyStatus, mergePermissionCatalogue } from '../utils/platform-access.utils';
import type { ApiKeySummary } from '../types';

/**
 * API keys.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THIS PAGE IS NOT PLATFORM-SCOPED, AND SAYS SO
 * ─────────────────────────────────────────────────────────────────────
 * `ApiKeyController.list` calls
 * `apiKeyService.listForOrganization(context.tenantId)` -- the caller's
 * own tenant, with no parameter that would widen it -- and `create`
 * writes into that same tenant. There is no cross-tenant API key
 * endpoint anywhere in app/api.
 *
 * So this manages the keys of whichever organization the signed-in
 * admin belongs to, not "the platform's" keys. The heading and the
 * banner both say that. A page titled "Platform API keys" showing one
 * tenant's keys is a lie an operator cannot detect by looking, and the
 * mistake it invites -- assuming a key seen here is the only one on the
 * platform -- is exactly the kind that gets found during an incident.
 *
 * See PLATFORM_ADMIN_BACKEND_GAPS.md for the endpoint that would make a
 * genuinely platform-wide view possible.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THE TABLE DOES THAT THE WIRE DOES NOT
 * ─────────────────────────────────────────────────────────────────────
 * `ApiKey.status` is never swept to 'expired' by a job -- expiry is
 * checked at authentication time in `ApiKeyService.verify` -- so a key
 * past its expiry still arrives as `status: 'active'`. The table
 * renders the EFFECTIVE status instead. See `effectiveApiKeyStatus()`.
 */
export function PlatformApiKeysPage() {
  const router = useRouter();
  const { user } = useAuth();
  const roles = user?.roles ?? [];

  const hasPlatformAccess = permissionService.hasPermission(roles, Permission.PLATFORM_VIEW);
  const canView = permissionService.hasPermission(roles, Permission.API_KEY_VIEW);
  const canManage = permissionService.hasPermission(roles, Permission.API_KEY_MANAGE);

  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const enabled = hasPlatformAccess && canView;
  const { data, isLoading, isFetching, isError, error, refetch } = useApiKeys({
    includeRevoked,
    enabled,
  });
  const catalogue = usePermissionDefinitions({ enabled });
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();

  const keys = useMemo(() => data ?? [], [data]);

  const counts = useMemo(() => {
    let active = 0;
    let expired = 0;
    let revoked = 0;
    for (const key of keys) {
      const status = effectiveApiKeyStatus(key);
      if (status === 'active') active += 1;
      else if (status === 'expired') expired += 1;
      else if (status === 'revoked') revoked += 1;
    }
    return { active, expired, revoked };
  }, [keys]);

  const permissions = useMemo(() => mergePermissionCatalogue(catalogue.data), [catalogue.data]);

  async function handleRevoke(key: ApiKeySummary) {
    const id = String(key._id ?? '');
    if (!id) return;
    setRevokingId(id);
    try {
      await revokeKey.mutateAsync({ id, reason: 'Revoked from the platform admin console' });
    } finally {
      setRevokingId(null);
    }
  }

  if (!hasPlatformAccess) {
    return (
      <EmptyState
        title="You don't have access to this page"
        description="Platform administration spans every tenant and isn't available to organization roles."
        action={{ label: 'Back to dashboard', onClick: () => router.push('/dashboard') }}
      />
    );
  }

  if (!canView) {
    return (
      <EmptyState
        title="API keys aren't available to your role"
        description="Listing API keys needs the API key view permission."
        action={{ label: 'Back to dashboard', onClick: () => router.push('/dashboard') }}
      />
    );
  }

  if (isLoading) {
    return <PageLoader label="Loading API keys" />;
  }

  return (
    <div className="p-4 space-y-6 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-h1">API keys</h1>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Machine credentials for your organization.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw
              className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Refresh
          </Button>
          {canManage && (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              New key
            </Button>
          )}
        </div>
      </div>

      {/*
        The scope statement, first thing on the page. See the component
        doc comment: this endpoint has no cross-tenant mode, and an
        operator who assumes otherwise draws the wrong conclusion from
        an empty table.
      */}
      <Alert>
        <Info className="size-4" aria-hidden="true" />
        <AlertTitle>These are your organization&apos;s keys, not the platform&apos;s</AlertTitle>
        <AlertDescription>
          The API key endpoints resolve the organization from your session, so this page can only
          ever show and create keys for the organization you belong to. There is no cross-tenant API
          key listing.
        </AlertDescription>
      </Alert>

      {isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Couldn&apos;t load API keys</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'An unexpected error occurred.'}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <StatisticCards>
            <StatisticCard title="Active" value={counts.active} />
            <StatisticCard
              title="Expired"
              value={counts.expired}
              description="Past their expiry date"
            />
            <StatisticCard
              title="Revoked"
              value={includeRevoked ? counts.revoked : '—'}
              description={includeRevoked ? undefined : 'Hidden — enable below to count'}
            />
            <StatisticCard title="Total shown" value={keys.length} />
          </StatisticCards>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
              <CardTitle>Keys</CardTitle>
              <label
                htmlFor="platform-admin-include-revoked"
                className="flex items-center gap-2 text-body-sm text-muted-foreground"
              >
                <Checkbox
                  id="platform-admin-include-revoked"
                  checked={includeRevoked}
                  onCheckedChange={(next) => setIncludeRevoked(next === true)}
                />
                <Label htmlFor="platform-admin-include-revoked" className="cursor-pointer">
                  Include revoked
                </Label>
              </label>
            </CardHeader>
            <CardContent>
              {isFetching && !isLoading ? (
                <div className="mb-2">
                  <Skeleton className="h-1 w-full" />
                </div>
              ) : null}

              {keys.length === 0 ? (
                <EmptyState
                  icon={<KeyRound className="size-8 text-muted-foreground" aria-hidden="true" />}
                  title="No API keys"
                  description={
                    canManage
                      ? 'Create a key to let a service authenticate against the API.'
                      : 'No keys have been created for this organization.'
                  }
                />
              ) : (
                <ApiKeyTable
                  keys={keys}
                  canRevoke={canManage}
                  onRevoke={handleRevoke}
                  revokingId={revokingId}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}

      {canManage && (
        <ApiKeyForm
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSubmit={(payload) => createKey.mutateAsync(payload)}
          isSubmitting={createKey.isPending}
          permissions={permissions}
        />
      )}
    </div>
  );
}
