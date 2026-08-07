# Fleet — row actions, fuel autofill, permission matrix

4 files.

| Path | Change |
|---|---|
| `server/permissions/roles.ts` | **Policy change** — grants delete + missing fuel/expense permissions |
| `frontend/modules/fuel/components/FuelForm.tsx` | Fuel type auto-fills from selected vehicle |
| `modules/organizations/services/organization.service.ts` | (from previous round) vehicle-create 500 + limit check |
| `modules/expenses/repositories/expense-type.repository.ts` | (from previous round) "Uncategorised" |

## 1. Per-row delete was never missing

`ExpensesTable`, `FuelTable` and `MaintenanceTable` already render a per-row
`⋯` menu containing View / Edit / **Delete**, gated on `canDelete`. Nothing was
missing from the UI. The buttons were hidden because **no role below
`organization_admin` held a single delete permission**:

```
ROLE                 EXPENSE_DEL  FUEL_DEL  MAINT_DEL  VEHICLE_DEL
BRANCH_MANAGER            -          -          -           -
DEPARTMENT_MANAGER        -          -          -           -
FLEET_MANAGER             -          -          -           -
WORKSHOP_MANAGER          -          -          -           -
ACCOUNTANT                -          -          -           -
```

Bulk delete uses the *same* `canDelete` flag, so it was hidden too — you saw it
work because you were signed in as owner.

**This is a policy change, and it needs your sign-off.** Principle applied:
*delete follows create+edit within scope* — a role that can create and edit a
record should be able to remove one entered in error, or every typo escalates to
an org admin.

| Role | Granted |
|---|---|
| `BRANCH_MANAGER` | EXPENSE_DELETE, FUEL_DELETE, TRIP_DELETE, MAINTENANCE_DELETE |
| `DEPARTMENT_MANAGER` | EXPENSE_DELETE, TRIP_DELETE |
| `FLEET_MANAGER` | FUEL_CREATE, FUEL_EDIT, FUEL_DELETE, EXPENSE_CREATE, EXPENSE_EDIT, MAINTENANCE_DELETE |
| `WORKSHOP_MANAGER` | MAINTENANCE_DELETE |
| `ACCOUNTANT` | EXPENSE_DELETE, FUEL_DELETE |

`VEHICLE_DELETE` deliberately **not** granted — removing a vehicle cascades to its
fuel, expense, trip and maintenance history. That stays with org admins.

Separately: `FLEET_MANAGER` had only `FUEL_VIEW` / `EXPENSE_VIEW`, so a fleet
manager could not record a refuel for their own vehicles. That was a functional
gap, not a delete gap, and is fixed above. It also explains why "Record Fuel" was
missing for that role.

Scope is unaffected — deletes still run through the scoped repositories.

## 2. Fuel type auto-fill
Selecting a vehicle now writes `fuel_type` from `tblvehicles.fuel_type`. Uses
`shouldDirty: false` so picking a vehicle doesn't mark a pristine form edited, and
only writes when the vehicle declares a type — an unset vehicle must not blank a
value the user typed. Field stays editable for dual-fuel conversions.

## 3. Organisation dashboard
Already scoped in the previous round (`getStatistics` takes `TenantContext`;
verified present). Fleet size and expense totals respect org units. Member counts
stay organization-level by design — the roster is organization data.

## 4. AI insights
Unchanged: safe "unavailable for your scope" placeholder for scoped users. Never
shows another branch's numbers.

## Verification
`npm run test:security` **171/171** · `npx tsc --noEmit` **83** (baseline 83).

After deploying, sign in as `harare.manager@` — the `⋯` menu on an expense row
should now show Delete.
