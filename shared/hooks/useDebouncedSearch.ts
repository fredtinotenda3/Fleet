// shared/hooks/useDebouncedSearch.ts

import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebounce } from 'use-debounce';

interface UseDebouncedSearchOptions {
  debounceMs?: number;
  minLength?: number;
  onSearch?: (value: string) => void;
}

export function useDebouncedSearch(options: UseDebouncedSearchOptions = {}) {
  const { debounceMs = 500, minLength = 2, onSearch } = options;
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm] = useDebounce(searchTerm, debounceMs);
  const [isSearching, setIsSearching] = useState(false);
  const onSearchRef = useRef(onSearch);

  // Update ref when onSearch changes
  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  // Handle search when debounced value changes
  useEffect(() => {
    const shouldSearch = debouncedSearchTerm.length >= minLength || debouncedSearchTerm.length === 0;
    
    if (shouldSearch && onSearchRef.current) {
      setIsSearching(true);
      onSearchRef.current(debouncedSearchTerm);
      // Use setTimeout to prevent state update during render
      setTimeout(() => setIsSearching(false), 0);
    }
  }, [debouncedSearchTerm, minLength]);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
  }, []);

  return {
    searchTerm,
    setSearchTerm,
    debouncedSearchTerm,
    isSearching,
    clearSearch,
  };
}