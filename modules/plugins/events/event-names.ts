// modules/plugins/events/event-names.ts
//
// Merge these into server/events/event-names.ts when wiring bootstrap
// subscriptions (Slice 10b subscribes PluginEventDispatchHandler to every
// platform domain event so a plugin's manifest.subscribedEvents actually
// gets delivered).

export const PLUGIN_INSTALLED = 'PluginInstalled';
export const PLUGIN_UPDATED = 'PluginUpdated';
export const PLUGIN_UNINSTALLED = 'PluginUninstalled';
export const PLUGIN_ENABLED = 'PluginEnabled';
export const PLUGIN_DISABLED = 'PluginDisabled';
export const PLUGIN_ERROR = 'PluginError';