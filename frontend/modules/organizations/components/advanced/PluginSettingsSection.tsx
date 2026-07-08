// frontend/modules/organizations/components/advanced/PluginSettingsSection.tsx
'use client';

import { useState } from 'react';
import { Puzzle, Trash2 } from 'lucide-react';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Switch } from '@/frontend/shared/ui/forms/switch';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { usePlugins, useTogglePlugin, useUninstallPlugin } from '../../hooks/useAdvancedSettings';
import type { PluginSummary } from '../../types/advanced.types';

export function PluginSettingsSection() {
  const { data: plugins = [], isLoading } = usePlugins();
  const togglePlugin = useTogglePlugin();
  const uninstallPlugin = useUninstallPlugin();
  const [confirmUninstall, setConfirmUninstall] = useState<PluginSummary | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 skeleton" />
        ))}
      </div>
    );
  }

  if (plugins.length === 0) {
    return (
      <div className="p-8 surface-card">
        <EmptyState
          title="No plugins installed"
          description="Browse the plugin registry to extend this organization with third-party integrations."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="divide-y surface-card divide-border">
        {plugins.map((plugin) => (
          <div key={plugin._id} className="flex items-center gap-3 p-4">
            <span className="flex items-center justify-center rounded-md h-9 w-9 shrink-0 bg-primary/10 text-primary">
              <Puzzle className="w-4 h-4" aria-hidden="true" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate text-foreground">{plugin.name}</span>
                <Badge variant="outline">v{plugin.version}</Badge>
              </div>
              {plugin.description && (
                <p className="mt-0.5 truncate text-caption text-muted-foreground">{plugin.description}</p>
              )}
              {plugin.capabilities.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {plugin.capabilities.map((cap) => (
                    <Badge key={cap} variant="outline" className="text-caption">
                      {cap}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <Switch
              checked={plugin.enabled}
              onCheckedChange={(checked) => togglePlugin.mutate({ pluginId: plugin._id, enabled: checked })}
              aria-label={`${plugin.enabled ? 'Disable' : 'Enable'} ${plugin.name}`}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmUninstall(plugin)}
              aria-label={`Uninstall ${plugin.name}`}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>

      {confirmUninstall && (
        <div role="alertdialog" aria-label="Confirm plugin uninstall" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-sm p-5 surface-card">
            <h3 className="text-h3">Uninstall &quot;{confirmUninstall.name}&quot;?</h3>
            <p className="mt-1.5 text-body-sm text-muted-foreground">
              Any automations or dashboard widgets depending on this plugin will stop working.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setConfirmUninstall(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  uninstallPlugin.mutate(confirmUninstall._id);
                  setConfirmUninstall(null);
                }}
              >
                Uninstall
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}