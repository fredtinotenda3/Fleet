// frontend/modules/organizations/components/members/AddMemberDialog.tsx
'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/frontend/shared/ui/feedback/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/frontend/shared/ui/navigation/tabs';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/frontend/shared/ui/forms/select';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import { inviteMemberSchema, InviteMemberFormValues, addMemberDirectSchema, AddMemberDirectFormValues } from '../../schemas';
import { useInviteMember, useAddMemberDirect } from '../../hooks/useOrganizationMutations';
import { useOrgUnits } from '../../hooks/useOrganizations';
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '../../types';
import type { OrganizationRole, InviteMemberPayload, AddMemberDirectResult } from '../../types';

interface AddMemberDialogProps {
  organizationId: string;
  trigger: React.ReactElement;
}

function BranchSelect({ value, onChange }: { value: string | undefined; onChange: (v: string | undefined) => void }) {
  const { data: units = [] } = useOrgUnits({ type: 'branch' });

  // Normalize '' | undefined | null to the 'none' sentinel so the Select's
  // controlled value always matches a real item — previously `?? undefined`
  // let an empty string slip through unmatched, which is what made a
  // selection appear not to "stick".
  const selectValue = value && value.length > 0 ? value : 'none';

  // FIX (raw value shown instead of label): Base UI's Select.Value only
  // resolves a friendly label when given an `items` map on Select, or a
  // label-mapping function as its own children (see
  // node_modules/@base-ui/react/select/value/SelectValue.js —
  // resolveSelectedLabel falls back to the raw value otherwise). Without
  // this, the trigger showed the raw branch _id (a Mongo ObjectId hex
  // string) instead of the branch's name.
  const labelByValue = new Map(units.map((u) => [u._id, `${u.name}${u.code ? ` (${u.code})` : ''}`]));
  labelByValue.set('none', 'No branch (organization-wide)');

  return (
    <Select value={selectValue} onValueChange={(v) => onChange(v === 'none' ? undefined : v)}>
      <SelectTrigger id="member-branch" className="input-base">
        <SelectValue placeholder="No branch (organization-wide)">
          {(v: string) => labelByValue.get(v) ?? v}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No branch (organization-wide)</SelectItem>
        {units.map((u) => (
          <SelectItem key={u._id} value={u._id}>
            {u.name}
            {u.code ? ` (${u.code})` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CredentialsPanel({ result, onDone }: { result: AddMemberDirectResult; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!result.temporaryPassword) return;
    await navigator.clipboard.writeText(result.temporaryPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="p-3 border rounded-md border-border bg-muted">
        <p className="text-body-sm text-foreground">
          <strong>{result.member.name}</strong> has been added
          {result.orgUnitAssigned ? ' and scoped to the selected branch' : ''}.
        </p>
        {result.reusedExistingAccount ? (
          <p className="mt-1 text-caption text-muted-foreground">
            This email already had an account, so it was linked instead of creating a new one — no new
            password was generated.
          </p>
        ) : result.temporaryPassword ? (
          <>
            <p className="mt-2 text-caption text-muted-foreground">
              Temporary password (shown only once — share it securely):
            </p>
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 px-2 py-1 font-mono text-sm border rounded-sm border-border bg-background">
                {result.temporaryPassword}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={copy}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}

export function AddMemberDialog({ organizationId, trigger }: AddMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [directResult, setDirectResult] = useState<AddMemberDirectResult | null>(null);

  const inviteMutation = useInviteMember(organizationId);
  const directMutation = useAddMemberDirect(organizationId);

  const inviteForm = useForm<InviteMemberFormValues>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: '', role: 'viewer' as OrganizationRole, orgUnitId: '' },
  });

  const directForm = useForm<AddMemberDirectFormValues>({
    resolver: zodResolver(addMemberDirectSchema),
    defaultValues: { name: '', email: '', role: 'viewer', password: '', orgUnitId: '' },
  });

  const onInviteSubmit = inviteForm.handleSubmit(async (values) => {
    const payload: InviteMemberPayload = {
      email: values.email,
      role: values.role as OrganizationRole,
      orgUnitId: values.orgUnitId || undefined,
    };
    await inviteMutation.mutateAsync(payload);
    inviteForm.reset();
    setOpen(false);
  });

  const onDirectSubmit = directForm.handleSubmit(async (values) => {
    const result = await directMutation.mutateAsync({
      name: values.name,
      email: values.email,
      role: values.role as OrganizationRole,
      password: values.password || undefined,
      orgUnitId: values.orgUnitId || undefined,
    });
    setDirectResult(result);
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      inviteForm.reset();
      directForm.reset();
      setDirectResult(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-form-narrow">
        <DialogHeader>
          <DialogTitle>Add a team member</DialogTitle>
          <DialogDescription>
            Invite someone by email, or add them directly with a ready-to-use login.
          </DialogDescription>
        </DialogHeader>

        {directResult ? (
          <CredentialsPanel result={directResult} onDone={() => handleOpenChange(false)} />
        ) : (
          <Tabs defaultValue="direct">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="direct">Add directly</TabsTrigger>
              <TabsTrigger value="invite">Invite by email</TabsTrigger>
            </TabsList>

            <TabsContent value="direct">
              <form onSubmit={onDirectSubmit} noValidate className="pt-4 space-y-4">
                <div>
                  <Label htmlFor="direct-name" className="form-label form-required">
                    Full name
                  </Label>
                  <Input
                    id="direct-name"
                    className={directForm.formState.errors.name ? 'input-error' : 'input-base'}
                    {...directForm.register('name')}
                  />
                  {directForm.formState.errors.name && (
                    <p className="form-error">{directForm.formState.errors.name.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="direct-email" className="form-label form-required">
                    Email address
                  </Label>
                  <Input
                    id="direct-email"
                    type="email"
                    className={directForm.formState.errors.email ? 'input-error' : 'input-base'}
                    {...directForm.register('email')}
                  />
                  {directForm.formState.errors.email && (
                    <p className="form-error">{directForm.formState.errors.email.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="direct-role" className="form-label form-required">
                    Role
                  </Label>
                  <Controller
                    control={directForm.control}
                    name="role"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="direct-role" className="input-base">
                          <SelectValue placeholder="Select role">
                            {(v: OrganizationRole) => ROLE_LABELS[v] ?? v}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {ASSIGNABLE_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div>
                  <Label htmlFor="member-branch" className="form-label">
                    Branch
                  </Label>
                  <Controller
                    control={directForm.control}
                    name="orgUnitId"
                    render={({ field }) => (
                      <BranchSelect value={field.value || undefined} onChange={(v) => field.onChange(v ?? '')} />
                    )}
                  />
                  <p className="form-hint">Leave blank for organization-wide access.</p>
                </div>

                <div>
                  <Label htmlFor="direct-password" className="form-label">
                    Password
                  </Label>
                  <Input
                    id="direct-password"
                    type="password"
                    className={directForm.formState.errors.password ? 'input-error' : 'input-base'}
                    {...directForm.register('password')}
                  />
                  {directForm.formState.errors.password ? (
                    <p className="form-error">{directForm.formState.errors.password.message}</p>
                  ) : (
                    <p className="form-hint">Leave blank to auto-generate a temporary password.</p>
                  )}
                </div>

                <DialogFooter>
                  <Button type="submit" disabled={directForm.formState.isSubmitting || directMutation.isPending}>
                    {(directForm.formState.isSubmitting || directMutation.isPending) && (
                      <Spinner className="w-4 h-4 mr-2" />
                    )}
                    Add member
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>

            <TabsContent value="invite">
              <form onSubmit={onInviteSubmit} noValidate className="pt-4 space-y-4">
                <div>
                  <Label htmlFor="invite-email" className="form-label form-required">
                    Email address
                  </Label>
                  <Input
                    id="invite-email"
                    type="email"
                    className={inviteForm.formState.errors.email ? 'input-error' : 'input-base'}
                    {...inviteForm.register('email')}
                  />
                  {inviteForm.formState.errors.email && (
                    <p className="form-error">{inviteForm.formState.errors.email.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="invite-role" className="form-label form-required">
                    Role
                  </Label>
                  <Controller
                    control={inviteForm.control}
                    name="role"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="invite-role" className="input-base">
                          <SelectValue placeholder="Select role">
                            {(v: OrganizationRole) => ROLE_LABELS[v] ?? v}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {ASSIGNABLE_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div>
                  <Label htmlFor="invite-branch" className="form-label">
                    Branch
                  </Label>
                  <Controller
                    control={inviteForm.control}
                    name="orgUnitId"
                    render={({ field }) => (
                      <BranchSelect value={field.value ?? undefined} onChange={(v) => field.onChange(v ?? '')} />
                    )}
                  />
                  <p className="form-hint">Applied once they accept the invitation.</p>
                </div>

                <DialogFooter>
                  <Button type="submit" disabled={inviteForm.formState.isSubmitting || inviteMutation.isPending}>
                    {(inviteForm.formState.isSubmitting || inviteMutation.isPending) && (
                      <Spinner className="w-4 h-4 mr-2" />
                    )}
                    Send invitation
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}