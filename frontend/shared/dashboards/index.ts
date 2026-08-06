// FIX: these re-exports pointed at empty placeholder files (a BOM and a
// newline, nothing else) or at names the target module never exported, so
// the barrel could not typecheck. Nothing in the application imported any
// of them. Dead exports removed rather than filling in speculative
// implementations for components no caller has specified.
﻿export { DashboardBuilder } from './DashboardBuilder';
export { DashboardGrid } from './DashboardGrid';
export { DashboardWidget } from './DashboardWidget';
export { WidgetRegistry } from './WidgetRegistry';
