// frontend/modules/maintenance/components/ServiceCalendar.tsx

'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { useAllMaintenanceRecords } from '../hooks/useMaintenance';
import { STATUS_BADGE_CLASSES, isRecordOverdue } from '../utils';
import type { Reminder } from '../types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildMonthGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

interface ServiceCalendarProps {
  onSelectRecord?: (record: Reminder) => void;
}

export function ServiceCalendar({ onSelectRecord }: ServiceCalendarProps) {
  const [cursor, setCursor] = useState(() => new Date());
  const { data: records, isLoading } = useAllMaintenanceRecords();

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const days = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const recordsByDay = useMemo(() => {
    const map = new Map<string, Reminder[]>();
    (records ?? []).forEach((record) => {
      const key = new Date(record.due_date).toDateString();
      const bucket = map.get(key) ?? [];
      bucket.push(record);
      map.set(key, bucket);
    });
    return map;
  }, [records]);

  if (isLoading) return <LoadingState type="full" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h3>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(year, month - 1, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(year, month + 1, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden text-xs border rounded-md bg-border">
        {WEEKDAYS.map((day) => (
          <div key={day} className="bg-muted px-2 py-1.5 text-center font-medium text-muted-foreground">
            {day}
          </div>
        ))}
        {days.map((day) => {
          const inMonth = day.getMonth() === month;
          const dayRecords = recordsByDay.get(day.toDateString()) ?? [];
          return (
            <div
              key={day.toISOString()}
              className={`min-h-24 space-y-1 bg-background p-1.5 ${inMonth ? '' : 'opacity-40'}`}
            >
              <span className="text-[11px] text-muted-foreground">{day.getDate()}</span>
              <div className="space-y-1">
                {dayRecords.slice(0, 3).map((record) => {
                  const overdue = isRecordOverdue(record);
                  return (
                    <button
                      key={record._id}
                      onClick={() => onSelectRecord?.(record)}
                      className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] hover:opacity-80"
                    >
                      <Badge className={`${STATUS_BADGE_CLASSES[overdue ? 'overdue' : record.status]} w-full justify-start truncate`}>
                        {record.license_plate}
                      </Badge>
                    </button>
                  );
                })}
                {dayRecords.length > 3 && (
                  <span className="block text-[10px] text-muted-foreground">+{dayRecords.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}