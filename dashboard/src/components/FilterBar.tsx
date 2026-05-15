/**
 * Filter bar for transaction search and filtering.
 *
 * All filtering happens on decrypted data client-side.
 * The server never sees filter criteria.
 */

import { Search, X } from "lucide-react";
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
  cardLabels?: Map<string, string>;
}

function uniqueValues(
  transactions: DecryptedTransaction[],
  field: keyof DecryptedTransaction
): string[] {
  const values = new Set(transactions.map((t) => String(t[field])));
  return Array.from(values).sort();
}

const selectClass =
  "block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40";

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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Filters
        </span>
        {hasActiveFilters && (
          <button
            onClick={onClear}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={12} />
            Clear all
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {/* Search */}
        <div className="min-w-[200px] flex-1">
          <label htmlFor="search" className="block text-xs font-medium text-slate-500 dark:text-slate-400">
            Search
          </label>
          <div className="relative mt-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search size={14} className="text-slate-400" />
            </div>
            <input
              id="search"
              type="text"
              value={filters.search ?? ""}
              onChange={(e) => onFilterChange("search", e.target.value || undefined)}
              placeholder="Merchant name..."
              className="block w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
            />
          </div>
        </div>

        {/* Month */}
        <div className="min-w-[130px]">
          <label htmlFor="month" className="block text-xs font-medium text-slate-500 dark:text-slate-400">
            Month
          </label>
          <select
            id="month"
            value={filters.month ?? ""}
            onChange={(e) => onFilterChange("month", e.target.value || undefined)}
            className={`mt-1 ${selectClass}`}
          >
            <option value="">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Card */}
        <div className="min-w-[130px]">
          <label htmlFor="card" className="block text-xs font-medium text-slate-500 dark:text-slate-400">
            Card
          </label>
          <select
            id="card"
            value={filters.cardId ?? ""}
            onChange={(e) => onFilterChange("cardId", e.target.value || undefined)}
            className={`mt-1 ${selectClass}`}
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
          <label htmlFor="category" className="block text-xs font-medium text-slate-500 dark:text-slate-400">
            Category
          </label>
          <select
            id="category"
            value={filters.category ?? ""}
            onChange={(e) => onFilterChange("category", e.target.value || undefined)}
            className={`mt-1 ${selectClass}`}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Amount range */}
        <div className="min-w-[90px]">
          <label htmlFor="amountMin" className="block text-xs font-medium text-slate-500 dark:text-slate-400">
            Min R$
          </label>
          <input
            id="amountMin"
            type="number"
            min="0"
            step="0.01"
            value={filters.amountMin ?? ""}
            onChange={(e) =>
              onFilterChange("amountMin", e.target.value ? Number(e.target.value) : undefined)
            }
            placeholder="0"
            className={`mt-1 ${selectClass}`}
          />
        </div>

        <div className="min-w-[90px]">
          <label htmlFor="amountMax" className="block text-xs font-medium text-slate-500 dark:text-slate-400">
            Max R$
          </label>
          <input
            id="amountMax"
            type="number"
            min="0"
            step="0.01"
            value={filters.amountMax ?? ""}
            onChange={(e) =>
              onFilterChange("amountMax", e.target.value ? Number(e.target.value) : undefined)
            }
            placeholder="999"
            className={`mt-1 ${selectClass}`}
          />
        </div>
      </div>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {filters.search && (
            <FilterChip label={`"${filters.search}"`} onRemove={() => onFilterChange("search", undefined)} />
          )}
          {filters.month && (
            <FilterChip label={filters.month} onRemove={() => onFilterChange("month", undefined)} />
          )}
          {filters.cardId && (
            <FilterChip
              label={cardLabels?.get(filters.cardId) ?? filters.cardId.slice(0, 8)}
              onRemove={() => onFilterChange("cardId", undefined)}
            />
          )}
          {filters.category && (
            <FilterChip label={filters.category} onRemove={() => onFilterChange("category", undefined)} />
          )}
          {filters.amountMin !== undefined && (
            <FilterChip label={`≥ R$${filters.amountMin}`} onRemove={() => onFilterChange("amountMin", undefined)} />
          )}
          {filters.amountMax !== undefined && (
            <FilterChip label={`≤ R$${filters.amountMax}`} onRemove={() => onFilterChange("amountMax", undefined)} />
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
      {label}
      <button
        onClick={onRemove}
        className="ml-0.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/60"
      >
        <X size={11} />
      </button>
    </span>
  );
}
