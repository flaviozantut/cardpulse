/**
 * Client-side filtering for decrypted transactions.
 *
 * All filtering operates on already-decrypted data in the browser.
 * The server never sees filter criteria — maintaining zero-knowledge.
 */

import type { DecryptedTransaction } from "../types/dashboard";

/** Active filter state for transactions. */
export interface TransactionFilters {
  month?: string;
  cardId?: string;
  category?: string;
  amountMin?: number;
  amountMax?: number;
  search?: string;
}

/**
 * Filters a list of decrypted transactions by the given criteria.
 *
 * All filters are combined with AND logic — a transaction must match
 * every active filter to be included in the result.
 */
export function filterTransactions(
  transactions: DecryptedTransaction[],
  filters: TransactionFilters
): DecryptedTransaction[] {
  return transactions.filter((tx) => {
    if (filters.month && tx.timestamp_bucket !== filters.month) {
      return false;
    }

    if (filters.cardId && tx.card_id !== filters.cardId) {
      return false;
    }

    if (filters.category && tx.category !== filters.category) {
      return false;
    }

    if (filters.amountMin !== undefined && tx.amount < filters.amountMin) {
      return false;
    }

    if (filters.amountMax !== undefined && tx.amount > filters.amountMax) {
      return false;
    }

    if (filters.search) {
      const query = filters.search.toLowerCase();
      const matchesMerchant = tx.merchant.toLowerCase().includes(query);
      const matchesDescription = tx.description.toLowerCase().includes(query);
      if (!matchesMerchant && !matchesDescription) {
        return false;
      }
    }

    return true;
  });
}

/** URL param key mapping for filter state. */
const PARAM_KEYS = {
  month: "month",
  cardId: "card",
  category: "category",
  amountMin: "min",
  amountMax: "max",
  search: "q",
} as const;

/**
 * Parses filter state from URL search params.
 *
 * Enables shareable filter URLs like `/?month=2026-03&q=mercado`.
 */
export function parseFiltersFromParams(
  params: URLSearchParams
): TransactionFilters {
  const filters: TransactionFilters = {};

  const month = params.get(PARAM_KEYS.month);
  if (month) filters.month = month;

  const cardId = params.get(PARAM_KEYS.cardId);
  if (cardId) filters.cardId = cardId;

  const category = params.get(PARAM_KEYS.category);
  if (category) filters.category = category;

  const minStr = params.get(PARAM_KEYS.amountMin);
  if (minStr) {
    const min = Number(minStr);
    if (!isNaN(min)) filters.amountMin = min;
  }

  const maxStr = params.get(PARAM_KEYS.amountMax);
  if (maxStr) {
    const max = Number(maxStr);
    if (!isNaN(max)) filters.amountMax = max;
  }

  const search = params.get(PARAM_KEYS.search);
  if (search) filters.search = search;

  return filters;
}

/**
 * Converts filter state to URL search params.
 *
 * Only includes params for active (non-undefined) filters.
 */
export function filtersToParams(filters: TransactionFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.month) params.set(PARAM_KEYS.month, filters.month);
  if (filters.cardId) params.set(PARAM_KEYS.cardId, filters.cardId);
  if (filters.category) params.set(PARAM_KEYS.category, filters.category);
  if (filters.amountMin !== undefined)
    params.set(PARAM_KEYS.amountMin, String(filters.amountMin));
  if (filters.amountMax !== undefined)
    params.set(PARAM_KEYS.amountMax, String(filters.amountMax));
  if (filters.search) params.set(PARAM_KEYS.search, filters.search);

  return params;
}
