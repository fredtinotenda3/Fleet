// frontend/modules/finance/components/AccountMappingPanel.tsx
//
// MODULE CONNECTIVITY UPGRADE (fuel/GL reconciliation gap).
//
// GLReconciliationPage's own footer already said the quiet part out
// loud: "Only postings carrying a GL account code appear here; unmapped
// costs are absent from both columns." Nothing anywhere in this product
// let an operator DO anything about that -- the backend
// (AllocationPostingService.postSource) now resolves a configured
// costCategory -> glAccountCode mapping onto every auto-posted fuel,
// maintenance, expense and depreciation record going forward (see
// OrganizationFinanceSettings.costCategoryGlAccountCodes's doc comment
// in finance-settings.types.ts), but until this panel existed there was
// no way to actually set that mapping -- the hook/API/schema were all
// already wired (useFinanceSettings, financeApi.updateSettings,
// updateFinanceSettingsSchema), just never surfaced.
//
// Deliberately placed on THIS page rather than a new "Finance Settings"
// page/route/nav entry: this is the one screen where an unmapped
// category is actually visible as a consequence (a category's fuel
// cost silently absent from both the Platform and GL columns), so the
// fix belongs next to the symptom rather than behind a separate
// settings surface nobody would think to visit first.

'use client';

import { useEffect, useState } from 'react';
import { Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { useFinanceSettings } from '../hooks/useFinance';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { Permission, permissionService } from '@/server/permissions/roles';
import type { AllocationCostCategory } from '../types';

/**
 * Only the categories an operator can actually DO something about here:
 * every costCategory AllocationPostingHandler/DepreciationService can
 * auto-post (see finance-settings.types.ts's doc comment). 'insurance',
 * 'other', the Olivine transport-cost categories and 'stock-transfer'
 * are never auto-posted from an event today, so a mapping for them
 * would have nothing to apply to -- omitted rather than offered as a
 * dead control.
 */
const MAPPABLE_CATEGORIES: Array<{ value: AllocationCostCategory; label: string }> = [
  { value: 'fuel', label: 'Fuel' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'expense', label: 'Expenses' },
  { value: 'depreciation', label: 'Depreciation' },
];

export function AccountMappingPanel() {
  const { user } = useSessionStore();
  const canManage = permissionService.hasPermission(user?.roles ?? [], Permission.FINANCE_MANAGE);

  const { data, isLoading, mutation } = useFinanceSettings();
  const [open, setOpen] = useState(false);
  const [codes, setCodes] = useState<Partial<Record<AllocationCostCategory, string>>>({});

  // Reset local edit state from the server whenever it loads/changes,
  // but never while a save is in flight (that would blank out what the
  // operator just typed if the query refetches mid-edit).
  useEffect(() => {
    if (!mutation.isPending) {
      setCodes(data?.saved?.costCategoryGlAccountCodes ?? {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.saved?.costCategoryGlAccountCodes]);

  if (isLoading || !data) return null;

  const resolved = data.resolved;
  const mappedCount = MAPPABLE_CATEGORIES.filter((c) => resolved.costCategoryGlAccountCodes[c.value]).length;

  const handleSave = () => {
    if (!data.saved) return; // fxPolicy is required by the schema; a tenant with no saved settings yet has nothing safe to submit from here.
    mutation.mutate({ ...data.saved, costCategoryGlAccountCodes: codes });
  };

  return (
    <section className="p-4 border rounded-lg sm:p-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <Settings2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Account mapping
          <span className="text-caption font-normal text-muted-foreground">
            {mappedCount} of {MAPPABLE_CATEGORIES.length} categories mapped
          </span>
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-caption text-muted-foreground">
            A cost category with no account code here never reaches the report above -- it is not reconciled,
            it is simply never compared. Map a category to your chart-of-accounts code to start posting it with
            that code going forward. This never rewrites costs already posted; only new postings after you save
            pick up the mapping.
          </p>

          {!data.saved && (
            <p className="text-caption text-warning">
              Set reporting currency and FX policy in Finance Settings before mapping accounts -- this organization
              has not saved finance settings yet.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {MAPPABLE_CATEGORIES.map((category) => (
              <div key={category.value}>
                <label htmlFor={`gl-map-${category.value}`} className="block mb-1 text-sm font-medium">
                  {category.label}
                </label>
                <input
                  id={`gl-map-${category.value}`}
                  className="input-base w-full font-mono"
                  placeholder="e.g. 6100-FUEL"
                  disabled={!canManage || !data.saved}
                  value={codes[category.value] ?? ''}
                  onChange={(event) =>
                    setCodes((prev) => ({ ...prev, [category.value]: event.target.value }))
                  }
                />
              </div>
            ))}
          </div>

          {canManage && (
            <div className="flex items-center gap-3">
              <Button size="sm" disabled={!data.saved || mutation.isPending} onClick={handleSave}>
                {mutation.isPending ? 'Saving…' : 'Save mapping'}
              </Button>
              {mutation.isSuccess && (
                <span className="text-caption text-success">Saved. New postings will use this mapping.</span>
              )}
              {mutation.isError && (
                <span className="text-caption text-danger">Couldn&apos;t save -- try again.</span>
              )}
            </div>
          )}

          {!canManage && (
            <p className="text-caption text-muted-foreground">
              You can view the current mapping but need finance management access to change it.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
