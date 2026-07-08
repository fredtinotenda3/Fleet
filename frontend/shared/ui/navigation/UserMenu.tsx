// frontend/shared/ui/navigation/UserMenu.tsx

'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { User, ShieldCheck, MonitorSmartphone, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/frontend/shared/ui/navigation/NestedMenu';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { getInitials } from '@/frontend/modules/organizations/utils';

export function UserMenu() {
  const user = useSessionStore((s) => s.user);

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex items-center justify-center w-8 h-8 text-xs font-semibold transition-opacity rounded-full bg-primary/10 text-primary hover:opacity-80"
        >
          {getInitials(user.name ?? user.email ?? 'U')}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <span className="block font-medium truncate text-foreground">{user.name}</span>
          <span className="block font-normal truncate text-caption text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Link href="/auth/profile" className="flex items-center w-full gap-2">
            <User className="h-3.5 w-3.5" aria-hidden="true" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Link href="/auth/account-security" className="flex items-center w-full gap-2">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Account security
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Link href="/auth/sessions" className="flex items-center w-full gap-2">
            <MonitorSmartphone className="h-3.5 w-3.5" aria-hidden="true" />
            Active sessions
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void signOut({ callbackUrl: '/auth/login' })}
          className="text-destructive"
        >
          <span className="flex items-center w-full gap-2">
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Sign out
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}