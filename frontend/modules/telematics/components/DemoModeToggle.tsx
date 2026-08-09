// frontend/modules/telematics/components/DemoModeToggle.tsx

'use client';

import { Sparkles } from 'lucide-react';
import { Switch } from '@/frontend/shared/ui/forms/switch';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { useDemoStatus, useSetDemoMode } from '../hooks';

interface DemoModeToggleProps {
  /** Whether the caller may flip the switch (Permission.VEHICLE_EDIT). Read-only callers still see the current state. */
  canToggle: boolean;
}

export function DemoModeToggle({ canToggle }: DemoModeToggleProps) {
  const { data: status, isLoading } = useDemoStatus();
  const setDemoMode = useSetDemoMode();

  const enabled = status?.enabled ?? false;

  return (
    <div className="flex items-center gap-2">
      {enabled && (
        <Badge variant="secondary" className="gap-1">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          Demo data
        </Badge>
      )}
      <label className="flex items-center gap-2 text-body-sm text-muted-foreground">
        Demo mode
        <Switch
          checked={enabled}
          disabled={!canToggle || isLoading || setDemoMode.isPending}
          onCheckedChange={(checked) => setDemoMode.mutate(checked)}
          aria-label="Toggle demo mode"
        />
      </label>
    </div>
  );
}