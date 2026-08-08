//frontend/shared/store/index.ts
// FIX: these re-exports pointed at empty placeholder files (a BOM and a
// newline, nothing else) or at names the target module never exported, so
// the barrel could not typecheck. Nothing in the application imported any
// of them. Dead exports removed rather than filling in speculative
// implementations for components no caller has specified.
﻿export { useUiStore } from './ui.store';
export { useSessionStore } from './session.store';
export { useThemeStore } from './theme.store';
export { useNotificationUiStore } from './notification.store';
export { useDashboardStore } from './dashboard.store';