// frontend/modules/leaderboard/components/MetricToggle.tsx
//
// Segmented control for switching a leaderboard's ranking metric.
//
// Built as a native-button radio group rather than reusing
// shared/ui/navigation/tabs.tsx: these controls do not switch PANELS,
// they re-rank one chart, and a tablist announces "tab 2 of 3, panel"
// to a screen reader for content that never changes region. WAI-ARIA's
// radiogroup pattern is the accurate one -- one control, several
// mutually exclusive values.
//
// Keyboard behaviour follows the APG radio-group pattern: the group is
// one tab stop (only the checked option is focusable), and
// Arrow/Home/End move the selection between options.

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface MetricToggleOption<T extends string> {
  value: T;
  label: string;
  /** Optional longer text for the accessible name, when the label alone is terse. */
  hint?: string;
  /** Renders the option greyed out and unselectable, e.g. when the user lacks its permission. */
  disabled?: boolean;
}

interface MetricToggleProps<T extends string> {
  /** Accessible name for the whole group, e.g. "Rank vehicles by". */
  label: string;
  value: T;
  options: ReadonlyArray<MetricToggleOption<T>>;
  onChange: (value: T) => void;
  className?: string;
}

export function MetricToggle<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: MetricToggleProps<T>) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const selectableIndexes = options
    .map((option, index) => (option.disabled ? -1 : index))
    .filter((index) => index >= 0);

  function moveSelection(currentIndex: number, direction: 1 | -1) {
    if (selectableIndexes.length === 0) return;
    const position = selectableIndexes.indexOf(currentIndex);
    // A disabled current option is not in the list; start from the
    // first selectable one rather than wrapping off a -1 position.
    const nextPosition =
      position === -1
        ? 0
        : (position + direction + selectableIndexes.length) % selectableIndexes.length;
    const nextIndex = selectableIndexes[nextPosition];
    onChange(options[nextIndex].value);
    refs.current[nextIndex]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        moveSelection(index, 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        moveSelection(index, -1);
        break;
      case 'Home':
        event.preventDefault();
        if (selectableIndexes.length > 0) {
          const first = selectableIndexes[0];
          onChange(options[first].value);
          refs.current[first]?.focus();
        }
        break;
      case 'End':
        event.preventDefault();
        if (selectableIndexes.length > 0) {
          const last = selectableIndexes[selectableIndexes.length - 1];
          onChange(options[last].value);
          refs.current[last]?.focus();
        }
        break;
      default:
        break;
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex items-center gap-1 rounded-lg bg-muted p-[3px]', className)}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.hint ? `${option.label} — ${option.hint}` : undefined}
            disabled={option.disabled}
            // Roving tabindex: the group is a single tab stop.
            tabIndex={checked ? 0 : -1}
            onClick={() => !option.disabled && onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              checked
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
              option.disabled && 'cursor-not-allowed opacity-50 hover:text-muted-foreground'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
