// frontend/modules/platform-admin/components/ApiKeyTable.tsx
'use client';

import { Ban } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import type { ApiKeySummary } from '../types';
import { formatDate } from '../utils/platform-admin.utils';
import {
  apiKeyStatusLabel,
  apiKeyStatusPresentation,
  effectiveApiKeyStatus,
  permissionKeyLabel,
} from '../utils/platform-access.utils';

interface ApiKeyTableProps {
  keys: readonly ApiKeySummary[];
  canRevoke: boolean;
  onRevoke: (key: ApiKeySummary) => void;
  revokingId?: string | null;
}

/** How many permission badges to render inline before collapsing to a count. */
const INLINE_PERMISSIONS = 4;

/**
 * API keys for the caller's own organization.
 *
 * TWO THINGS THIS TABLE DOES THAT ARE NOT COSMETIC:
 *
 * 1. It shows the EFFECTIVE status, not the stored one.
 *    `ApiKey.status` is written at creation and changed on revoke; it is
 *    never swept to 'expired' by a job -- `ApiKeyService.verify` checks
 *    `expiresAt` at authentication time instead. So a key past its
 *    expiry still reads `status: 'active'` on the wire while being
 *    unusable. Rendering that verbatim would tell an operator a dead key
 *    is live. See `effectiveApiKeyStatus()`.
 *
 * 2. It never renders a secret. The server strips `keyHash` before
 *    responding and the plaintext exists only in the create response,
 *    so the only key material here is `keyPrefix`, which is the
 *    non-secret display prefix.
 */
export function ApiKeyTable({ keys, canRevoke, onRevoke, revokingId }: ApiKeyTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Prefix</TableHead>
            <TableHead>Permissions</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last used</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((key) => {
            const id = String(key._id ?? key.keyPrefix);
            const status = effectiveApiKeyStatus(key);
            const presentation = apiKeyStatusPresentation(status);
            const permissions = Array.isArray(key.permissions) ? key.permissions : [];
            const shown = permissions.slice(0, INLINE_PERMISSIONS);
            const overflow = permissions.length - shown.length;

            return (
              <TableRow key={id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{key.name}</span>
                    {key.revokedReason && (
                      <span className="text-body-sm text-muted-foreground">
                        Revoked: {key.revokedReason}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {/*
                    The display prefix only. The secret half was never
                    sent -- the server destructures `keyHash` away before
                    responding, and the plaintext is returned once at
                    creation and never again.
                  */}
                  <code className="text-body-sm text-muted-foreground">{key.keyPrefix}</code>
                </TableCell>
                <TableCell>
                  {permissions.length === 0 ? (
                    <span className="text-body-sm text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1">
                      {shown.map((permission) => (
                        <Badge key={permission} variant="outline" title={permission}>
                          {permissionKeyLabel(permission)}
                        </Badge>
                      ))}
                      {overflow > 0 && (
                        <span
                          className="text-caption text-muted-foreground"
                          title={permissions.join(', ')}
                        >
                          +{overflow} more
                        </span>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={presentation.badgeVariant} className="gap-1">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${presentation.dotClassName}`}
                      aria-hidden="true"
                    />
                    {apiKeyStatusLabel(status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-body-sm text-muted-foreground">
                  {/*
                    An em dash means never used. It is NOT rendered as
                    the creation date, which would suggest traffic that
                    never happened.
                  */}
                  {formatDate(key.lastUsedAt)}
                </TableCell>
                <TableCell className="text-body-sm text-muted-foreground">
                  {key.expiresAt ? formatDate(key.expiresAt) : 'Never'}
                </TableCell>
                <TableCell className="text-right">
                  {canRevoke && status !== 'revoked' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onRevoke(key)}
                      disabled={revokingId === id}
                    >
                      <Ban className="size-3.5" aria-hidden="true" />
                      Revoke
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
