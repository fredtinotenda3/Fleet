// frontend/modules/reports/components/SaveReportDialog.tsx

'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { ReportDefinitionForm } from '../schemas/reportDefinition';

interface SaveReportDialogProps {
  open: boolean;
  form: ReportDefinitionForm;
  isSaving: boolean;
  errors: Record<string, string>;
  onClose: () => void;
  onSave: (patch: Pick<ReportDefinitionForm, 'name' | 'description' | 'isShared' | 'tags'>) => void;
}

export function SaveReportDialog({ open, form, isSaving, errors, onClose, onSave }: SaveReportDialogProps) {
  const [name, setName] = useState(form.name);
  const [description, setDescription] = useState(form.description ?? '');
  const [isShared, setIsShared] = useState(form.isShared);
  const [tagsInput, setTagsInput] = useState(form.tags.join(', '));

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      isShared,
      tags: tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40">
      <div className="w-full max-w-md p-5 border rounded-lg shadow-lg bg-background">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Save report</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-accent" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="report-name" className="block mb-1 text-sm font-medium">
              Name
            </label>
            <input
              id="report-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background"
              placeholder="e.g. Monthly Fuel Cost by Department"
              required
            />
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="report-description" className="block mb-1 text-sm font-medium">
              Description <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="report-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background"
            />
          </div>

          <div>
            <label htmlFor="report-tags" className="block mb-1 text-sm font-medium">
              Tags <span className="text-muted-foreground">(comma separated)</span>
            </label>
            <input
              id="report-tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background"
              placeholder="finance, monthly"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isShared}
              onChange={(e) => setIsShared(e.target.checked)}
              className="w-4 h-4 rounded border-input"
            />
            Share with everyone in this organization
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm font-medium border rounded-md hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim()}
              className="px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}