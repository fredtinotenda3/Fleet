// frontend/modules/dvir/components/DVIRForm.tsx
'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { ChecklistItem } from './ChecklistItem';
import { DVIR_CHECKLIST } from '../types';
import type { DVIRInspectionType, DVIRItemDraft, DVIRVehicleOption, DVIRQueuedSubmission } from '../types';
import { queueInspection, flushQueue } from '../lib/sync';

function newDraftItems(): DVIRItemDraft[] {
  return DVIR_CHECKLIST.map((c) => ({ category: c.category, label: c.label, status: 'ok', description: '' }));
}

function mintClientInspectionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `dvir-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function DVIRForm() {
  const [vehicles, setVehicles] = React.useState<DVIRVehicleOption[]>([]);
  const [loadingVehicles, setLoadingVehicles] = React.useState(true);
  const [licensePlate, setLicensePlate] = React.useState('');
  const [type, setType] = React.useState<DVIRInspectionType>('pre_trip');
  const [odometer, setOdometer] = React.useState('');
  const [items, setItems] = React.useState<DVIRItemDraft[]>(newDraftItems);
  const [outOfService, setOutOfService] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/vehicles?limit=200&status=active');
        const json = await res.json();
        if (!cancelled && json.success) {
          const options: DVIRVehicleOption[] = (json.data || []).map((v: any) => ({
            license_plate: v.license_plate,
            make: v.make,
            model: v.model,
          }));
          setVehicles(options);
          if (options.length === 1) setLicensePlate(options[0].license_plate);
        }
      } catch {
        toast.error('Could not load your vehicles. You can still enter a license plate manually.');
      } finally {
        if (!cancelled) setLoadingVehicles(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateItem(index: number, next: DVIRItemDraft) {
    setItems((prev) => prev.map((it, i) => (i === index ? next : it)));
  }

  function resetForm() {
    setItems(newDraftItems());
    setOutOfService(false);
    setOdometer('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!licensePlate.trim()) {
      toast.error('Select or enter a vehicle license plate.');
      return;
    }
    const defects = items.filter((i) => i.status === 'defect');
    for (const d of defects) {
      if (!d.description.trim()) {
        toast.error(`Add a description for the "${d.label}" defect.`);
        return;
      }
    }

    const clientInspectionId = mintClientInspectionId();
    const payload: DVIRQueuedSubmission = {
      clientInspectionId,
      license_plate: licensePlate.trim().toUpperCase(),
      type,
      odometer: odometer ? Number(odometer) : undefined,
      outOfService,
      items: items.map((i) => ({
        category: i.category,
        label: i.label,
        status: i.status,
        description: i.description || undefined,
        photoBase64: i.photoBase64,
        photoMimeType: i.photoMimeType,
      })),
      queuedAt: Date.now(),
      attempts: 0,
    };

    setSubmitting(true);
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await queueInspection(payload);
        toast.success('No connection -- inspection saved and will sync automatically.');
        resetForm();
        return;
      }

      const res = await fetch('/api/dvir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_plate: payload.license_plate,
          type: payload.type,
          odometer: payload.odometer,
          outOfService: payload.outOfService,
          items: payload.items,
          clientInspectionId: payload.clientInspectionId,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const wasFlagged = json?.data?.overallStatus !== 'pass';
        toast.success(
          wasFlagged
            ? `Inspection submitted -- ${defects.length} defect(s) reported${outOfService ? ', vehicle flagged Out of Service' : ''}.`
            : 'Inspection submitted -- no defects found.'
        );
        resetForm();
      } else if (res.status >= 500) {
        // Server-side failure, not a rejection of the payload -- queue
        // it so the driver doesn't have to redo the whole checklist.
        await queueInspection(payload);
        toast.warning('Server error -- inspection saved and will retry automatically.');
        resetForm();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error?.message || 'Could not submit inspection.');
      }
    } catch {
      // fetch threw -- almost certainly a connectivity failure that
      // navigator.onLine didn't catch (flaky signal rather than fully
      // offline).
      await queueInspection(payload);
      toast.success('Connection issue -- inspection saved and will sync automatically.');
      resetForm();
    } finally {
      setSubmitting(false);
      void flushQueue();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-24">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="size-4" />
            Vehicle & trip
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType('pre_trip')}
              className={cn(
                'h-12 rounded-lg border text-sm font-semibold',
                type === 'pre_trip' ? 'border-transparent bg-primary text-primary-foreground' : 'border-border hover:bg-muted'
              )}
            >
              Pre-Trip
            </button>
            <button
              type="button"
              onClick={() => setType('post_trip')}
              className={cn(
                'h-12 rounded-lg border text-sm font-semibold',
                type === 'post_trip' ? 'border-transparent bg-primary text-primary-foreground' : 'border-border hover:bg-muted'
              )}
            >
              Post-Trip
            </button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dvir-vehicle">Vehicle</Label>
            {loadingVehicles ? (
              <div className="flex h-11 items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading your vehicles...
              </div>
            ) : vehicles.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {vehicles.map((v) => (
                  <button
                    key={v.license_plate}
                    type="button"
                    onClick={() => setLicensePlate(v.license_plate)}
                    className={cn(
                      'flex h-11 items-center rounded-lg border px-3 text-sm font-medium',
                      licensePlate === v.license_plate
                        ? 'border-transparent bg-primary text-primary-foreground'
                        : 'border-border hover:bg-muted'
                    )}
                  >
                    {v.license_plate}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No vehicles are assigned to your branch/fleet yet.</p>
            )}
            <Input
              id="dvir-vehicle"
              value={licensePlate}
              onChange={(e) => setLicensePlate(e.target.value.toUpperCase())}
              placeholder="Or type a license plate"
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dvir-odometer">Odometer (optional)</Label>
            <Input
              id="dvir-odometer"
              type="number"
              inputMode="numeric"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
              placeholder="e.g. 84210"
              className="h-11"
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {DVIR_CHECKLIST.map((def, i) => (
          <ChecklistItem key={def.category} item={items[i]} helpText={def.helpText} onChange={(next) => updateItem(i, next)} />
        ))}
      </div>

      <Card className={cn(outOfService && 'ring-2 ring-destructive')}>
        <CardContent className="flex items-start gap-3 py-4">
          <button
            type="button"
            onClick={() => setOutOfService((v) => !v)}
            aria-pressed={outOfService}
            className={cn(
              'flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border-2',
              outOfService ? 'border-destructive bg-destructive text-white' : 'border-border text-muted-foreground'
            )}
          >
            <AlertTriangle className="size-6" />
          </button>
          <div className="min-w-0">
            <p className="font-semibold">Out of Service</p>
            <p className="text-xs text-muted-foreground">
              This vehicle must not be driven. Immediately flags the vehicle and notifies the workshop.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 p-3 backdrop-blur">
        <Button type="submit" size="lg" disabled={submitting} className="h-13 w-full text-base">
          {submitting ? <Loader2 className="size-5 animate-spin" /> : `Submit ${type === 'pre_trip' ? 'Pre-Trip' : 'Post-Trip'} Inspection`}
        </Button>
      </div>
    </form>
  );
}
