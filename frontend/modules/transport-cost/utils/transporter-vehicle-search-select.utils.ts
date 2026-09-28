// frontend/modules/transport-cost/utils/transporter-vehicle-search-select.utils.ts
//
// PRODUCTION FIX (Olivine live readiness pass, Oct 2026 cutover).
//
// Root cause this closes: every manual-entry form's Transporter and
// Truck registration fields were search-only, with `onCreateNew` left
// permanently unwired -- so "+ Add New" never rendered for those two
// fields anywhere, in contrast to Customer/Destination on the very same
// forms. That is the client's reported "Transporter: does not
// consistently show + Add New" / "Truck registration: does not
// consistently show + Add New" defect: it was not flaky, it was simply
// always absent.
//
// The fix wires "+ Add New" for both, pointed at the EXISTING
// review-gated request-new flow (requestNewTransporter/requestNewVehicle
// -- the same one EditRecordDialog.tsx already uses, reviewStatus:
// 'needs-review') rather than a synchronous confirmed create. This
// satisfies the client's own instruction to "reuse the existing
// master-data creation flow" and "do not leave uncontrolled free text
// in the transaction" without ever bypassing Slice 3's human-review
// gate on a ledger-postable Transporter/Vehicle identity -- ABSOLUTE
// RULE: no uncontrolled free-text identity fields where controlled
// master data exists.
//
// The one genuine constraint this cannot route around:
// ContractedVehicle.transporterPartnerId is required server-side (a
// vehicle cannot exist without a transporter -- see
// request-new-vehicle.command.ts's own doc comment: "The manual-entry
// form resolves the transporter first (search or its own request-new
// flow), then this."). A manual-entry row's Transporter field commits a
// plain display-name STRING (matching every other free-text column on
// these forms), not an id, so this factory closes over the
// last-RESOLVED transporter id (via SearchCreateSelect's
// onResultSelected hook) and makes it available to the Vehicle field's
// own "+ Add New Truck" action. "+ Add New Truck" therefore always
// renders (parity with the client's own mockup), but if clicked before
// a transporter has been picked or added, it fails with a clear,
// inline, catchable error instead of silently linking the new truck to
// the wrong transporter or to none at all -- see
// SearchCreateSelect.tsx's existing error handling, unchanged. The
// resolved transporter is invalidated the moment the operator types
// something into the Transporter field that no longer matches it, so a
// stale id can never survive an edit.
//
// Pulled out of TransportCostImportPage.tsx (a .tsx file) into this
// plain .ts module for the same reason
// operation-data-quality.utils.ts was: this project's Jest config has
// no JSX transform wired up for its node test environment, so logic
// living inside a .tsx file is untestable here. The api-client calls
// are taken as injected functions (`deps`), not imported directly, so
// this factory's branching -- not the real HTTP client -- is what a
// unit test exercises.
//
// Each caller (3rd Party, Vansales, Depot STO -- the three families
// that have both fields; Swift has neither, see SWIFT_COLUMNS' own
// comment) MUST call this factory separately, so each gets its own
// private closure: resolving a transporter in one family's manual-entry
// modal must never leak into another's.

export interface SearchSelectResult {
  id: string;
  label: string;
}

export interface SearchSelectPage {
  results: SearchSelectResult[];
  hasMore: boolean;
}

export interface TransporterVehicleSearchSelectDeps {
  searchTransporters: (query: string) => Promise<SearchSelectPage>;
  requestNewTransporter: (name: string) => Promise<SearchSelectResult>;
  searchVehicles: (query: string, transporterPartnerId?: string) => Promise<SearchSelectPage>;
  requestNewVehicle: (params: { registration: string; transporterPartnerId: string }) => Promise<SearchSelectResult>;
}

export interface TransporterVehicleSearchSelectConfig {
  search: (query: string) => Promise<SearchSelectPage>;
  onCreateNew: (name: string) => Promise<SearchSelectResult>;
  onResultSelected?: (result: SearchSelectResult) => void;
  createLabel: string;
}

export interface TransporterVehicleSearchSelect {
  transporter: TransporterVehicleSearchSelectConfig;
  vehicle: TransporterVehicleSearchSelectConfig;
  /** Test/debug only -- the currently-resolved transporter this closure is tracking, if any. */
  getResolvedTransporter: () => SearchSelectResult | null;
}

export function createTransporterVehicleSearchSelect(
  deps: TransporterVehicleSearchSelectDeps
): TransporterVehicleSearchSelect {
  let resolvedTransporter: SearchSelectResult | null = null;

  return {
    transporter: {
      search: async (q: string) => {
        const trimmed = q.trim();
        if (
          resolvedTransporter &&
          trimmed.length > 0 &&
          trimmed.toLowerCase() !== resolvedTransporter.label.trim().toLowerCase()
        ) {
          // Operator is typing something else -- the previously
          // resolved id no longer describes what's in the field.
          resolvedTransporter = null;
        }
        return deps.searchTransporters(q);
      },
      onCreateNew: async (name: string) => {
        const result = await deps.requestNewTransporter(name);
        return { id: result.id, label: result.label };
      },
      onResultSelected: (result) => {
        resolvedTransporter = { id: result.id, label: result.label };
      },
      createLabel: 'Transporter',
    },
    vehicle: {
      // Narrowed to the resolved transporter's own fleet once one is
      // known -- purely a search-quality improvement (fewer, more
      // relevant matches); vehicle search itself never required a
      // transporter to be picked first, unlike creation below.
      search: (q: string) => deps.searchVehicles(q, resolvedTransporter?.id),
      onCreateNew: async (name: string) => {
        if (!resolvedTransporter) {
          throw new Error('Pick or add a transporter above first, then add a new truck.');
        }
        const result = await deps.requestNewVehicle({
          registration: name,
          transporterPartnerId: resolvedTransporter.id,
        });
        return { id: result.id, label: result.label };
      },
      createLabel: 'Truck',
    },
    getResolvedTransporter: () => resolvedTransporter,
  };
}
