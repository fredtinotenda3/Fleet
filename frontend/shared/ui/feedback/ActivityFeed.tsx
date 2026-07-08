'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface Activity {
  id: string;
  user: string;
  action: string;
  target?: string;
  timestamp: string;
}

interface ActivityFeedProps {
  activities: Activity[];
  className?: string;
}

export function ActivityFeed({ activities, className }: ActivityFeedProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {activities.map((activity) => (
        <div key={activity.id} className="flex items-start gap-4 text-sm">
          <div className="w-2 h-2 mt-2 rounded-full bg-primary" />
          <div className="flex-1">
            <p>
              <span className="font-medium">{activity.user}</span>{' '}
              {activity.action}
              {activity.target && <span className="font-medium"> {activity.target}</span>}
            </p>
            <span className="text-xs text-muted-foreground">{activity.timestamp}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
