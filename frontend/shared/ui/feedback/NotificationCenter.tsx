//frontend/shared/ui/feedback/NotificationCenter.tsx

'use client';

import * as React from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/frontend/shared/ui/navigation/popover';
import { ScrollArea } from '@/frontend/shared/ui/layout/scroll-area';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  title: string;
  description?: string;
  read: boolean;
  timestamp: string;
}

interface NotificationCenterProps {
  notifications: Notification[];
  onMarkAsRead?: (id: string) => void;
  onMarkAllAsRead?: () => void;
}

export function NotificationCenter({ notifications, onMarkAsRead, onMarkAllAsRead }: NotificationCenterProps) {
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <Popover>
      <PopoverTrigger 
        render={
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-5 h-5" />
            {unread > 0 && (
              <span className="absolute flex items-center justify-center w-5 h-5 text-xs text-white bg-red-500 rounded-full -top-1 -right-1">
                {unread}
              </span>
            )}
          </Button>
        } 
      />
      <PopoverContent className="p-0 w-80">
        <div className="flex items-center justify-between p-4 border-b">
          <h4 className="font-medium">Notifications</h4>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={onMarkAllAsRead}>
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-80">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={cn(
                'flex flex-col gap-1 p-4 border-b cursor-pointer hover:bg-muted/50',
                !notification.read && 'bg-muted/30'
              )}
              onClick={() => onMarkAsRead?.(notification.id)}
            >
              <div className="flex items-center gap-2">
                {!notification.read && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                <span className="text-sm font-medium">{notification.title}</span>
              </div>
              {notification.description && (
                <p className="text-xs text-muted-foreground">{notification.description}</p>
              )}
              <span className="text-xs text-muted-foreground">{notification.timestamp}</span>
            </div>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}