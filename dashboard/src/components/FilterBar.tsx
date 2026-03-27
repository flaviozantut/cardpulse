/**
 * Filter bar for transaction search and filtering.
 *
 * All filtering happens on decrypted data client-side.
 * The server never sees filter criteria.
 */

import type { TransactionFilters } from "../lib/filters";
import type { DecryptedTransaction } from "../types/dashboard";

interface FilterBarProps {
  filters: TransactionFilters;
  onFilterChange: <K extends keyof TransactionFilters>(
    key: K,
    value: TransactionFilters[K]
  ) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
  transactions: DecryptedTransaction[];
  /** Map of card_id → display label for the card selector. */
  cardLabels?: Map<string, string>;
}

/** Extracts unique sorted values from a field across transactions. */
function uniqueValues(
  transactions: DecryptedTransaction[],
  field: keyof DecryptedTransaction
): string[] {
  const values = new Set(transactions.map((t) => String(t[field])));
  return Array.from(values).sort();
}

export function FilterBar({
  filters,
  onFilterChange,
  onClear,
  hasActiveFilters,
  transactions,
  cardLabels,
}: FilterBarProps) {
  const months = uniqueValues(transactions, "timestamp_bucket");
  const categories = uniqueValues(transactions, "category");
  const cardIds = uniqueValues(transactions, "card_id");

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        {/* Search */}
        <div className="min-w-[200px] flex-1">
          <label
            htmlFor="search"
            className="block text-xs font-medium text-gray-500"
          >
            Search
          </label>
          <input
            id="search"
            type="text"
            value={filters.search ?? ""}
            onChange={(e) => onFilterChange("search", e.target.value || undefined)}
            placeholder="Merchant name..."
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        {/* Month */}
        <div className="min-w-[130px]">
          <label
            htmlFor="month"
            className="block text-xs font-medium text-gray-500"
          >
            Month
          </label>
          <select
            id="month"
            value={filters.month ?? ""}
            onChange={(e) => onFilterChange("month", e.target.value || undefined)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* Card */}
        <div className="min-w-[130px]">
          <label
            htmlFor="card"
            className="block text-xs font-medium text-gray-500"
          >
            Card
          </label>
          <select
            id="card"
            value={filters.cardId ?? ""}
            onChange={(e) =>
              onFilterChange("cardId", e.target.value || undefined)
            }
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">All cards</option>
            {cardIds.map((c) => (
              <option key={c} value={c}>
                {cardLabels?.get(c) ?? `${c.slice(0, 8)}...`}
              </option>
            ))}
          </select>
        </div>

        {/* Category */}
        <div className="min-w-[130px]">
          <label
            htmlFor="category"
            className="block text-xs font-medium text-gray-500"
          >
            Category
          </label>
          <select
            id="category"
            value={filters.category ?? ""}
            onChange={(e) =>
              onFilterChange("category", e.target.value || undefined)
            }
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Amount range */}
        <div className="min-w-[90px]">
          <label
            htmlFor="amountMin"
            className="block text-xs font-medium text-gray-500"
          >
            Min R$
          </label>
          <input
            id="amountMin"
            type="number"
            min="0"
            step="0.01"
            value={filters.amountMin ?? ""}
            onChange={(e) =>
              onFilterChange(
                "amountMin",
                e.target.value ? Number(e.target.value) : undefined
              )
            }
            placeholder="0"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="min-w-[90px]">
          <label
            htmlFor="amountMax"
            className="block text-xs font-medium text-gray-500"
          >
            Max R$
          </label>
          <input
            id="amountMax"
            type="number"
            min="0"
            step="0.01"
            value={filters.amountMax ?? ""}
            onChange={(e) =>
              onFilterChange(
                "amountMax",
                e.target.value ? Number(e.target.value) : undefined
              )
            }
            placeholder="999"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={onClear}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
