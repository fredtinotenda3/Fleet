// frontend/modules/platform-admin/components/ApiKeyForm.tsx
'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, Search } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/frontend/shared/ui/feedback/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/frontend/shared/ui/feedback/alert';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Checkbox } from '@/frontend/shared/ui/forms/checkbox';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import type { ApiKeyCreateResult, CreateApiKeyPayload, PermissionDefinition } from '../types';
import {
  groupPermissionsByCategory,
  toCreateApiKeyPayload,
  validateCreateApiKey,
} from '../utils/platform-access.utils';
import type { FieldErrors } from '../utils/platform-admin.utils';

interface ApiKeyFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateApiKeyPayload) => Promise<ApiKeyCreateResult>;
  isSubmitting?: boolean;
  /** The merged permission catalogue to pick grants from. */
  permissions: readonly PermissionDefinition[];
}

const EMPTY = { name: '', expiresAt: '' };

/**
 * Create-API-key dialog, in two acts.
 *
 * ACT 2 IS THE REASON THIS IS A DIALOG AND NOT A ROW FORM. The
 * plaintext key is returned by POST /api/security/api-keys ONCE and
 * never again -- only its hash is stored, and `list`/`getById` strip
 * even that. A toast that scrolls away, or a form that closes on
 * success, loses the key permanently. So on success the dialog does not
 * close: it swaps to a copy-once panel that the operator has to dismiss
 * deliberately.
 *
 * Validation is `validateCreateApiKey` from ../utils rather than a zod
 * resolver, matching OrganizationForm's reasoning: it mirrors what
 * `apiKeyCreateSchema` actually enforces (name 1-100, >= 1 permission)
 * and adds the one rule the server does not have -- an expiry in the
 * past, which the schema accepts and which would mint a key that is
 * dead on arrival.
 */
export function ApiKeyForm({
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
  permissions,
}: ApiKeyFormProps) {
  const [values, setValues] = useState(EMPTY);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [filter, setFilter] = useState('');
  const [created, setCreated] = useState<ApiKeyCreateResult | null>(null);
  const [copied, setCopied] = useState(false);

  const grouped = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matching = needle
      ? permissions.filter(
          (permission) =>
            permission.key.toLowerCase().includes(needle) ||
            (permission.label ?? '').toLowerCase().includes(needle)
        )
      : permissions;
    return groupPermissionsByCategory(matching);
  }, [permissions, filter]);

  function reset() {
    setValues(EMPTY);
    setSelected(new Set());
    setErrors({});
    setFilter('');
    setCreated(null);
    setCopied(false);
  }

  function close() {
    reset();
    onClose();
  }

  function togglePermission(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setErrors((current) => ({ ...current, permissions: '' }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const candidate = {
      name: values.name,
      permissions: Array.from(selected),
      expiresAt: values.expiresAt || null,
    };

    const validation = validateCreateApiKey(candidate);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    const result = await onSubmit(toCreateApiKeyPayload(candidate));
    // Held rather than closed -- see the component's doc comment.
    setCreated(result);
  }

  async function copyKey() {
    if (!created?.plaintextKey) return;
    try {
      await navigator.clipboard.writeText(created.plaintextKey);
      setCopied(true);
    } catch {
      // Clipboard access can be denied (insecure context, permission
      // policy). The key is already selectable on screen, so this is a
      // convenience that failed, not a lost key -- and silently
      // flipping to "Copied" would be a lie.
      setCopied(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? close() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy your API key now</DialogTitle>
              <DialogDescription>
                This is the only time the key will be shown.
              </DialogDescription>
            </DialogHeader>

            <Alert variant="destructive">
              <AlertTriangle className="size-4" aria-hidden="true" />
              <AlertTitle>It cannot be retrieved again</AlertTitle>
              <AlertDescription>
                Only a hash of this key is stored. If you lose it, revoke the key and create a new
                one — there is no way to display it a second time.
              </AlertDescription>
            </Alert>

            <div className="space-y-1.5">
              <Label htmlFor="platform-admin-created-key">
                {created.apiKey?.name ?? 'New API key'}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="platform-admin-created-key"
                  readOnly
                  value={created.plaintextKey}
                  className="font-mono"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button type="button" variant="outline" onClick={copyKey}>
                  {copied ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : (
                    <Copy className="size-3.5" aria-hidden="true" />
                  )}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" onClick={close}>
                I&apos;ve saved it
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>New API key</DialogTitle>
              <DialogDescription>
                Keys are scoped to your organization and carry only the permissions you grant here.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="platform-admin-key-name">Name</Label>
                <Input
                  id="platform-admin-key-name"
                  value={values.name}
                  maxLength={100}
                  onChange={(event) => {
                    const name = event.target.value;
                    setValues((current) => ({ ...current, name }));
                    setErrors((current) => ({ ...current, name: '' }));
                  }}
                  placeholder="Nightly telematics sync"
                  aria-invalid={Boolean(errors.name) || undefined}
                />
                {errors.name && <p className="text-body-sm text-destructive">{errors.name}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="platform-admin-key-expiry">Expires</Label>
                <Input
                  id="platform-admin-key-expiry"
                  type="date"
                  value={values.expiresAt}
                  onChange={(event) => {
                    const expiresAt = event.target.value;
                    setValues((current) => ({ ...current, expiresAt }));
                    setErrors((current) => ({ ...current, expiresAt: '' }));
                  }}
                  aria-invalid={Boolean(errors.expiresAt) || undefined}
                />
                <p className="text-caption text-muted-foreground">
                  Leave blank for a key that never expires.
                </p>
                {errors.expiresAt && (
                  <p className="text-body-sm text-destructive">{errors.expiresAt}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label>Permissions</Label>
                  <Badge variant="secondary">{selected.size} selected</Badge>
                </div>

                <div className="relative">
                  <Search
                    className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="Filter permissions"
                    className="pl-7"
                    aria-label="Filter permissions"
                  />
                </div>

                <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border border-border p-3">
                  {grouped.length === 0 ? (
                    <p className="text-body-sm text-muted-foreground">No permissions match.</p>
                  ) : (
                    grouped.map((group) => (
                      <div key={group.category} className="space-y-1.5">
                        <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                          {group.category}
                        </p>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {group.permissions.map((permission) => {
                            const id = `platform-admin-perm-${permission.key}`;
                            return (
                              <label
                                key={permission.key}
                                htmlFor={id}
                                className="flex items-start gap-2 text-body-sm"
                                title={permission.description ?? permission.key}
                              >
                                <Checkbox
                                  id={id}
                                  checked={selected.has(permission.key)}
                                  onCheckedChange={() => togglePermission(permission.key)}
                                />
                                <span className="min-w-0">
                                  <span className="block truncate">{permission.label}</span>
                                  <code className="block truncate text-caption text-muted-foreground">
                                    {permission.key}
                                  </code>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {errors.permissions && (
                  <p className="text-body-sm text-destructive">{errors.permissions}</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner className="size-3.5" />}
                Create key
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
