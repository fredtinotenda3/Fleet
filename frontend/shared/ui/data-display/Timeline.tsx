'use client';

import * as React from 'react';

interface TimelineProps {
  children: React.ReactNode;
}

export function Timeline({ children }: TimelineProps) {
  return <div className="relative space-y-4">{children}</div>;
}

interface TimelineItemProps {
  title: string;
  description?: string;
  timestamp?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export function TimelineItem({ title, description, timestamp, icon, children }: TimelineItemProps) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        {icon || <div className="h-3 w-3 rounded-full bg-primary" />}
        <div className="w-px flex-1 bg-border" />
      </div>
      <div className="pb-4">
        <div className="flex items-center gap-2">
          <h4 className="font-medium">{title}</h4>
          {timestamp && <span className="text-sm text-muted-foreground">{timestamp}</span>}
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {children}
      </div>
    </div>
  );
}
