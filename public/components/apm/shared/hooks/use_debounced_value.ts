/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';

/**
 * Hook that debounces a value by the specified delay.
 * Useful for preventing expensive operations on every keystroke in search inputs.
 *
 * @param value - The value to debounce
 * @param delay - The delay in milliseconds (default: 150ms)
 * @returns The debounced value that updates after the delay
 *
 * @example
 * const [searchQuery, setSearchQuery] = useState('');
 * const debouncedSearchQuery = useDebouncedValue(searchQuery, 150);
 *
 * // Use debouncedSearchQuery in expensive filtering operations
 * const filteredItems = useMemo(() => {
 *   return items.filter(item => item.name.includes(debouncedSearchQuery));
 * }, [items, debouncedSearchQuery]);
 */
export function useDebouncedValue<T>(value: T, delay: number = 150): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
