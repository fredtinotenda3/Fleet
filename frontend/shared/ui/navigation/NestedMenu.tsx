
// frontend/shared/ui/navigation/NestedMenu.tsx
//
// Lightweight, dependency-free dropdown/nested-menu primitive. Provides
// the DropdownMenu* API surface consumed throughout
// frontend/modules/organizations (OrganizationSwitcher, MemberRowActions)
// and the new shell components (UserMenu, ThemeToggle, Sidebar). Built
// directly on React state + portal-free absolute positioning (matching
// the codebase's existing preference for hand-rolled overlays, e.g. the
// inline confirm dialogs in RoleList.tsx / MemberRowActions.tsx) rather
// than assuming a particular internal shape for the base-ui-backed
// dropdown-menu.tsx primitive.

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | null>(null);

function useDropdownMenuContext(component: string): DropdownMenuContextValue {
  const ctx = React.useContext(DropdownMenuContext);
  if (!ctx) {
    throw new Error(`${component} must be used within a <DropdownMenu>`);
  }
  return ctx;
}

interface DropdownMenuProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
}

export function DropdownMenu({ children, open, onOpenChange, defaultOpen = false }: DropdownMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolledOpen;

  const setOpen = React.useCallback(
    (value: boolean) => {
      if (!isControlled) setUncontrolledOpen(value);
      onOpenChange?.(value);
    },
    [isControlled, onOpenChange]
  );

  React.useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, setOpen]);

  const value = React.useMemo(
    () => ({ open: isOpen, setOpen, containerRef }),
    [isOpen, setOpen]
  );

  return (
    <DropdownMenuContext.Provider value={value}>
      <div ref={containerRef} className="relative inline-block">
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
}

interface DropdownMenuTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  children: React.ReactElement | React.ReactNode;
}

export function DropdownMenuTrigger({ asChild, children, className, ...props }: DropdownMenuTriggerProps) {
  const { open, setOpen } = useDropdownMenuContext('DropdownMenuTrigger');

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    setOpen(!open);
  };

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<Record<string, unknown>>;
    return React.cloneElement(child, {
      onClick: (event: React.MouseEvent) => {
        (child.props as { onClick?: (e: React.MouseEvent) => void }).onClick?.(event);
        handleClick(event);
      },
      'aria-haspopup': 'menu',
      'aria-expanded': open,
    });
  }

  return (
    <button
      type="button"
      className={cn('inline-flex items-center', className)}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={handleClick}
      {...props}
    >
      {children}
    </button>
  );
}

interface DropdownMenuContentProps {
  children: React.ReactNode;
  align?: 'start' | 'end' | 'center';
  className?: string;
  sideOffset?: number;
}

export function DropdownMenuContent({ children, align = 'start', className, sideOffset = 8 }: DropdownMenuContentProps) {
  const { open } = useDropdownMenuContext('DropdownMenuContent');
  if (!open) return null;

  const alignClass =
    align === 'end' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0';

  return (
    <div
      role="menu"
      style={{ marginTop: sideOffset }}
      className={cn(
        'absolute z-50 min-w-48 animate-slide-up overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg',
        alignClass,
        className
      )}
    >
      {children}
    </div>
  );
}

interface DropdownMenuItemProps extends React.HTMLAttributes<HTMLDivElement> {
  onSelect?: () => void;
  disabled?: boolean;
  closeOnSelect?: boolean;
}

export function DropdownMenuItem({
  children,
  onSelect,
  disabled,
  className,
  closeOnSelect = true,
  role = 'menuitem',
  ...props
}: DropdownMenuItemProps) {
  const { setOpen } = useDropdownMenuContext('DropdownMenuItem');

  return (
    <div
      role={role}
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onSelect?.();
        if (closeOnSelect) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect?.();
          if (closeOnSelect) setOpen(false);
        }
      }}
      className={cn(
        'flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none transition-colors',
        disabled ? 'pointer-events-none opacity-50' : 'hover:bg-muted focus-visible:bg-muted',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function DropdownMenuLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)}>
      {children}
    </div>
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <div role="separator" className={cn('my-1 h-px bg-border', className)} />;
}

interface DropdownMenuSubProps {
  label: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** Flyout submenu, opened on hover/click of its label row. */
export function DropdownMenuSub({ label, icon, children, className }: DropdownMenuSubProps) {
  const [subOpen, setSubOpen] = React.useState(false);
  const subRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!subOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (subRef.current && !subRef.current.contains(event.target as Node)) setSubOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [subOpen]);

  return (
    <div ref={subRef} className="relative">
      <div
        role="menuitem"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          setSubOpen((v) => !v);
        }}
        className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
      >
        <span className="flex items-center gap-2">
          {icon}
          {label}
        </span>
        <span aria-hidden="true" className="text-muted-foreground">
          &rsaquo;
        </span>
      </div>
      {subOpen && (
        <div
          className={cn(
            'absolute left-full top-0 z-50 ml-1 min-w-40 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg',
            className
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export const NestedMenu = {
  Root: DropdownMenu,
  Trigger: DropdownMenuTrigger,
  Content: DropdownMenuContent,
  Item: DropdownMenuItem,
  Label: DropdownMenuLabel,
  Separator: DropdownMenuSeparator,
  Sub: DropdownMenuSub,
};