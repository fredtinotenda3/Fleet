
'use client';

// FIX (Critical): this file re-exported `DataTable` from
// `@/frontend/shared/tables/DataTable`, which is an EMPTY stub file
// (frontend/shared/tables/DataTable.tsx has 0 bytes of implementation --
// confirmed during the Reports Center audit, along with every other file
// in frontend/shared/tables/ and frontend/shared/forms/, none of which
// have been implemented yet). Anything importing `DataGrid` from
// `@/frontend/shared/ui/data-display` (the barrel file re-exports it)
// was rendering `undefined`, i.e. nothing, silently.
//
// The actual working table implementation lives at
// `@/shared/ui/tables/DataTable` (root-level shared/, not frontend/shared/)
// -- it's a real TanStack Table wrapper with sorting, manual pagination,
// loading skeletons and an empty state, and is what the new Reports
// module's ReportResultTable is built on. Re-pointing DataGrid at it here
// so every existing caller of `DataGrid` picks up a real table for free.
//
// frontend/shared/tables/* remains unimplemented and out of scope for the
// Reports Center work -- flagging it as a separate Medium/High item since
// other modules may currently rely on it in the same broken way.

import { DataTable } from '@/shared/ui/tables/DataTable';

export { DataTable as DataGrid };