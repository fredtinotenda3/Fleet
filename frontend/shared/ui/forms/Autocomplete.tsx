'use client';

import * as React from 'react';
import { Command, CommandGroup, CommandItem } from '@/frontend/shared/ui/navigation/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/frontend/shared/ui/navigation/popover';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AutocompleteProps {
  options: { label: string; value: string }[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}

export function Autocomplete({ options, value, onChange, placeholder = 'Select...' }: AutocompleteProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between">
          {value ? options.find((o) => o.value === value)?.label : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandGroup>
            {options.map((option) => (
              <CommandItem
                key={option.value}
                value={option.value}
                onSelect={() => {
                  onChange?.(option.value);
                  setOpen(false);
                }}
              >
                <Check className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
                {option.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
