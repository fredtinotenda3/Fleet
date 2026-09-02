// frontend/modules/workflows/components/WorkflowDefinitionForm.tsx
//
// Create/edit form for a workflow definition. `steps`, `triggers` and
// `config` are edited as JSON -- a full drag-and-drop step builder is
// out of scope here, but the backend's DTOs (WorkflowStep,
// WorkflowTrigger, WorkflowConfig in ../types) are simple enough that a
// validated JSON editor is a reasonable, honest way to expose full
// authoring capability without inventing a UI the backend doesn't
// already describe. Validation happens client-side only as a
// convenience; workflowCreateSchema/workflowUpdateSchema
// (shared/validations/workflow.schema.ts) are the real gate and will
// reject anything this misses.

'use client';

import { useState } from 'react';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Textarea } from '@/frontend/shared/ui/forms/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { Alert, AlertDescription } from '@/frontend/shared/ui/feedback/alert';
import { AlertTriangle } from 'lucide-react';
import {
  WORKFLOW_STATUSES,
  WORKFLOW_STATUS_LABELS,
  WORKFLOW_TYPE_LABELS,
  type WorkflowDefinition,
  type WorkflowCreatePayload,
  type WorkflowType,
  type WorkflowStatus,
} from '../types';

interface WorkflowDefinitionFormProps {
  initial?: WorkflowDefinition;
  onSubmit: (payload: WorkflowCreatePayload) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const WORKFLOW_TYPES = Object.keys(WORKFLOW_TYPE_LABELS) as WorkflowType[];

export function WorkflowDefinitionForm({ initial, onSubmit, onCancel, isSubmitting }: WorkflowDefinitionFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<WorkflowType>(initial?.type ?? 'expense_approval');
  const [status, setStatus] = useState<WorkflowStatus>(initial?.status ?? 'draft');
  const [version, setVersion] = useState<number>(initial?.version ?? 1);
  const [stepsJson, setStepsJson] = useState(() => JSON.stringify(initial?.steps ?? [], null, 2));
  const [triggersJson, setTriggersJson] = useState(() => JSON.stringify(initial?.triggers ?? [], null, 2));
  const [configJson, setConfigJson] = useState(() => JSON.stringify(initial?.config ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);

    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    let steps: WorkflowCreatePayload['steps'];
    let triggers: WorkflowCreatePayload['triggers'];
    let config: WorkflowCreatePayload['config'];

    try {
      steps = JSON.parse(stepsJson);
      if (!Array.isArray(steps) || steps.length === 0) {
        setError('Steps must be a non-empty JSON array.');
        return;
      }
    } catch {
      setError('Steps is not valid JSON.');
      return;
    }

    try {
      triggers = JSON.parse(triggersJson);
      if (!Array.isArray(triggers)) {
        setError('Triggers must be a JSON array.');
        return;
      }
    } catch {
      setError('Triggers is not valid JSON.');
      return;
    }

    try {
      config = JSON.parse(configJson);
    } catch {
      setError('Config is not valid JSON.');
      return;
    }

    await onSubmit({ name: name.trim(), type, status, version, steps, triggers, config });
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="workflow-name">Name</Label>
        <Input id="workflow-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="workflow-type">Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as WorkflowType)}>
            <SelectTrigger id="workflow-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORKFLOW_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {WORKFLOW_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="workflow-status">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as WorkflowStatus)}>
            <SelectTrigger id="workflow-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORKFLOW_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {WORKFLOW_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-version">Version</Label>
        <Input
          id="workflow-version"
          type="number"
          min={1}
          value={version}
          onChange={(e) => setVersion(Math.max(1, parseInt(e.target.value, 10) || 1))}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-steps">Steps (JSON)</Label>
        <Textarea
          id="workflow-steps"
          value={stepsJson}
          onChange={(e) => setStepsJson(e.target.value)}
          rows={8}
          className="font-mono text-xs"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-triggers">Triggers (JSON)</Label>
        <Textarea
          id="workflow-triggers"
          value={triggersJson}
          onChange={(e) => setTriggersJson(e.target.value)}
          rows={4}
          className="font-mono text-xs"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-config">Config (JSON)</Label>
        <Textarea
          id="workflow-config"
          value={configJson}
          onChange={(e) => setConfigJson(e.target.value)}
          rows={4}
          className="font-mono text-xs"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {initial ? 'Save changes' : 'Create workflow'}
        </Button>
      </div>
    </div>
  );
}
