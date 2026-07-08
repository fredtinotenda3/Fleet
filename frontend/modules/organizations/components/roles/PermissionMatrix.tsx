// frontend/modules/organizations/components/roles/PermissionMatrix.tsx
'use client';

import { useMemo } from 'react';
import type { PermissionDefinition } from '../../types';

interface PermissionMatrixProps {
  definitions: PermissionDefinition[];
  selected: Set<string>;
  onChange: (key: string, checked: boolean) => void;
  disabled?: boolean;
}

function labelizeCategory(category: string): string {
  return category
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function PermissionMatrix({ definitions, selected, onChange, disabled }: PermissionMatrixProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, PermissionDefinition[]>();
    for (const def of definitions) {
      if (!map.has(def.category)) map.set(def.category, []);
      map.get(def.category)!.push(def);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [definitions]);

  return (
    <div className="p-3 space-y-4 overflow-y-auto border rounded-md max-h-104 border-border">
      {grouped.map(([category, defs]) => {
        const allChecked = defs.every((d) => selected.has(d.key));
        return (
          <div key={category}>
            <div className="mb-1.5 flex items-center justify-between">
              <h4 className="uppercase text-section-title text-muted-foreground">
                {labelizeCategory(category)}
              </h4>
              <button
                type="button"
                disabled={disabled}
                className="text-caption text-primary hover:underline disabled:opacity-50"
                onClick={() => defs.forEach((d) => onChange(d.key, !allChecked))}
              >
                {allChecked ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {defs.map((def) => (
                <label
                  key={def.key}
                  className="flex items-start gap-2 rounded-sm px-1.5 py-1 text-sm hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm border-input"
                    checked={selected.has(def.key)}
                    disabled={disabled}
                    onChange={(e) => onChange(def.key, e.target.checked)}
                  />
                  <span>
                    <span className="block text-foreground">{def.label}</span>
                    {def.requiresResourceScope && (
                      <span className="block text-caption text-muted-foreground">Resource-scoped</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}

      {grouped.length === 0 && (
        <p className="py-6 text-sm text-center text-muted-foreground">No permissions available.</p>
      )}
    </div>
  );
}