// frontend/shared/ui/navigation/RecentlyViewed.tsx

'use client';

import Link from 'next/link';
import { History } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/frontend/shared/ui/navigation/NestedMenu';
import { useUiStore } from '@/frontend/shared/store/ui.store';

export function RecentlyViewed() {
  const recentlyViewed = useUiStore((s) => s.recentlyViewed);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Recently viewed pages"
          className="flex items-center justify-center w-8 h-8 transition-colors rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <History className="w-4 h-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Recently viewed</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {recentlyViewed.length === 0 ? (
          <p className="px-2 py-3 text-body-sm text-muted-foreground">
            Pages you visit will show up here.
          </p>
        ) : (
          recentlyViewed.map((entry) => (
            <DropdownMenuItem key={entry.path}>
              <Link href={entry.path} className="block w-full truncate">
                {entry.label}
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
