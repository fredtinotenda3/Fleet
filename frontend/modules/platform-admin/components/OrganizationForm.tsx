// frontend/modules/platform-admin/components/OrganizationForm.tsx
'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/frontend/shared/ui/feedback/dialog';
import { Alert, AlertDescription } from '@/frontend/shared/ui/feedback/alert';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import {
  toCreateOrganizationPayload,
  validateCreateOrganization,
  type FieldErrors,
} from '../utils/platform-admin.utils';
import type { CreateOrganizationPayload } from '../types';

interface OrganizationFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateOrganizationPayload) => Promise<unknown>;
  isSubmitting?: boolean;
}

const EMPTY = { name: '', ownerName: '', ownerEmail: '' };

/**
 * Create-organization dialog.
 *
 * Validation is `validateCreateOrganization` from ../utils rather than
 * a zod resolver, deliberately: the backend has NO schema for this
 * endpoint (`OrganizationController.createOrganization` reads
 * `body.name / body.ownerEmail / body.ownerName` straight off the
 * request and only the service's own `name` check runs), so there is no
 * server schema to mirror with `zodResolver`. Writing one here would
 * imply a contract that does not exist. The rules live in a pure
 * function that the unit tests assert directly.
 */
export function OrganizationForm({
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
}: OrganizationFormProps) {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});

  function close() {
    setValues(EMPTY);
    setErrors({});
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const found = validateCreateOrganization(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    await onSubmit(toCreateOrganizationPayload(values));
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create organization</DialogTitle>
            <DialogDescription>
              Creates a new tenant. The tenant ID is generated from the name as a slug and
              cannot be changed afterwards.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/*
              Stated up front rather than discovered afterwards: POST
              /api/organizations sets ownerId from the CALLER. There is
              no platform endpoint that creates an organization owned by
              a third party, so the admin filling this in becomes the
              owner and the fields below only populate the owner member
              record.
            */}
            <Alert>
              <Info className="size-4" aria-hidden="true" />
              <AlertDescription>
                You will be recorded as this organization&apos;s owner. The owner details below
                populate the member record; they do not transfer ownership. Ownership can be
                reassigned from the organization&apos;s own members page afterwards.
              </AlertDescription>
            </Alert>

            <div className="space-y-1.5">
              <Label htmlFor="platform-admin-org-name">Organization name</Label>
              <Input
                id="platform-admin-org-name"
                value={values.name}
                onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                placeholder="Willsgrove Farm Enterprises"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'platform-admin-org-name-error' : undefined}
              />
              {errors.name && (
                <p id="platform-admin-org-name-error" className="text-body-sm text-destructive">
                  {errors.name}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="platform-admin-owner-name">Owner name</Label>
              <Input
                id="platform-admin-owner-name"
                value={values.ownerName}
                onChange={(e) => setValues((v) => ({ ...v, ownerName: e.target.value }))}
                placeholder="Jane Moyo"
                aria-invalid={Boolean(errors.ownerName)}
                aria-describedby={errors.ownerName ? 'platform-admin-owner-name-error' : undefined}
              />
              {errors.ownerName && (
                <p id="platform-admin-owner-name-error" className="text-body-sm text-destructive">
                  {errors.ownerName}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="platform-admin-owner-email">Owner email</Label>
              <Input
                id="platform-admin-owner-email"
                type="email"
                value={values.ownerEmail}
                onChange={(e) => setValues((v) => ({ ...v, ownerEmail: e.target.value }))}
                placeholder="owner@example.com"
                aria-invalid={Boolean(errors.ownerEmail)}
                aria-describedby={errors.ownerEmail ? 'platform-admin-owner-email-error' : undefined}
              />
              {errors.ownerEmail && (
                <p id="platform-admin-owner-email-error" className="text-body-sm text-destructive">
                  {errors.ownerEmail}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner className="mr-2 size-4" />}
              Create organization
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
