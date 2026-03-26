/**
 * Hook for managing transaction filters synced with URL query params.
 *
 * Reads initial filter state from the URL and updates the URL when
 * filters change — enabling shareable/bookmarkable filter states.
 */

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  type TransactionFilters,
  parseFiltersFromParams,
  filtersToParams,
} from "../lib/filters";

/** Hook return type with current filters and update functions. */
export interface UseFiltersReturn {
  filters: TransactionFilters;
  setFilters: (filters: TransactionFilters) => void;
  updateFilter: <K extends keyof TransactionFilters>(
    key: K,
    value: TransactionFilters[K]
  ) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
}

/** Manages filter state synchronized with URL search params. */
export function useFilters(): UseFiltersReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(
    () => parseFiltersFromParams(searchParams),
    [searchParams]
  );

  const setFilters = useCallback(
    (newFilters: TransactionFilters) => {
      const params = filtersToParams(newFilters);
      setSearchParams(params, { replace: true });
    },
    [setSearchParams]
  );

  const updateFilter = useCallback(
    <K extends keyof TransactionFilters>(
      key: K,
      value: TransactionFilters[K]
    ) => {
      const updated = { ...filters };
      if (value === undefined || value === "") {
        delete updated[key];
      } else {
        updated[key] = value;
      }
      setFilters(updated);
    },
    [filters, setFilters]
  );

  const clearFilters = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const hasActiveFilters = Object.keys(filters).length > 0;

  return { filters, setFilters, updateFilter, clearFilters, hasActiveFilters };
}
