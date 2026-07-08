
// frontend/shared/ui/navigation/Favorites.tsx

'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Star } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/frontend/shared/ui/navigation/NestedMenu';
import { useUiStore } from '@/frontend/shared/store/ui.store';
import { cn } from '@/lib/utils';

export function Favorites() {
  const pathname = usePathname();
  const favorites = useUiStore((s) => s.favorites);
  const isFavorite = useUiStore((s) => s.isFavorite);
  const toggleFavorite = useUiStore((s) => s.toggleFavorite);

  const currentIsFavorite = pathname ? isFavorite(pathname) : false;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() =>
          pathname && toggleFavorite({ path: pathname, label: document.title || pathname })
        }
        aria-pressed={currentIsFavorite}
        aria-label={currentIsFavorite ? 'Remove from favorites' : 'Add to favorites'}
        className="flex items-center justify-center w-8 h-8 transition-colors rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Star
          className={cn('h-4 w-4', currentIsFavorite && 'fill-warning text-warning')}
          aria-hidden="true"
        />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="items-center hidden h-8 gap-1 px-2 transition-colors rounded-md text-body-sm text-muted-foreground hover:bg-muted hover:text-foreground sm:flex"
          >
            Favorites
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Your favorites</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {favorites.length === 0 ? (
            <p className="px-2 py-3 text-body-sm text-muted-foreground">
              Star a page to pin it here.
            </p>
          ) : (
            favorites.map((fav) => (
              <DropdownMenuItem key={fav.path}>
                <Link href={fav.path} className="flex items-center w-full gap-2">
                  <Star className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden="true" />
                  <span className="truncate">{fav.label}</span>
                </Link>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}