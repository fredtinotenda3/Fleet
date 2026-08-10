// frontend/modules/dvir/components/ChecklistItem.tsx
'use client';

import * as React from 'react';
import { Camera, CheckCircle2, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/frontend/shared/ui/forms/textarea';
import { captureFileToBase64 } from '../lib/photo';
import type { DVIRItemDraft } from '../types';

interface ChecklistItemProps {
  item: DVIRItemDraft;
  helpText: string;
  onChange: (next: DVIRItemDraft) => void;
}

export function ChecklistItem({ item, helpText, onChange }: ChecklistItemProps) {
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const captured = await captureFileToBase64(file);
      onChange({ ...item, photoBase64: captured.base64, photoMimeType: captured.mimeType, photoPreviewUrl: captured.previewUrl });
    } catch {
      // Photo capture failing shouldn't block the defect report itself.
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{item.label}</p>
          <p className="text-xs text-muted-foreground">{helpText}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...item, status: 'ok' })}
          className={cn(
            'flex h-14 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors',
            item.status === 'ok'
              ? 'border-transparent bg-emerald-600 text-white'
              : 'border-border bg-background text-foreground hover:bg-muted'
          )}
          aria-pressed={item.status === 'ok'}
        >
          <CheckCircle2 className="size-5" />
          OK
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...item, status: 'defect' })}
          className={cn(
            'flex h-14 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors',
            item.status === 'defect'
              ? 'border-transparent bg-destructive text-white'
              : 'border-border bg-background text-foreground hover:bg-muted'
          )}
          aria-pressed={item.status === 'defect'}
        >
          <XCircle className="size-5" />
          Defect Found
        </button>
      </div>

      {item.status === 'defect' && (
        <div className="mt-3 space-y-3">
          <Textarea
            value={item.description}
            onChange={(e) => onChange({ ...item, description: e.target.value })}
            placeholder="Describe the defect (required)"
            className="min-h-20"
          />

          {item.photoPreviewUrl ? (
            <div className="relative w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element -- local base64/object URL preview, not a remote asset */}
              <img src={item.photoPreviewUrl} alt="Defect photo" className="h-28 w-28 rounded-lg object-cover ring-1 ring-foreground/10" />
              <button
                type="button"
                onClick={() => onChange({ ...item, photoBase64: undefined, photoMimeType: undefined, photoPreviewUrl: undefined })}
                className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-foreground text-background"
                aria-label="Remove photo"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <Camera className="size-4" />
              {uploading ? 'Processing photo...' : 'Add photo (optional)'}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhoto}
          />
        </div>
      )}
    </div>
  );
}
