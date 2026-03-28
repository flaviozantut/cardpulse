/**
 * Main dashboard page showing decrypted transactions with filters.
 *
 * Fetches encrypted data from the API, decrypts client-side using
 * the DEK, sorts by date descending, and applies client-side filters.
 * Defaults to the current month with prev/next month navigation.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listCards, listTransactions, updateTransaction } from "../lib/api";
import { decryptCard, formatCardLabel } from "../lib/card-data";
import { decryptTransaction } from "../lib/transaction-data";
import { filterTransactions } from "../lib/filters";
import {
  sortByDateDescending,
  formatTransactionDate,
  navigateMonth,
  currentBucket,
  formatBucket,
} from "../lib/transactions";
import {
  buildCategoryPayload,
  extractUniqueCategories,
} from "../lib/categories";
import { fetchOverrides, saveOverrides, addOverride } from "../lib/overrides";
import type { CategoryOverrides } from "../lib/overrides";
import { useAuth } from "../hooks/useAuth";
import { useFilters } from "../hooks/useFilters";
import { FilterBar } from "../components/FilterBar";
import { SpendingCharts } from "../components/SpendingCharts";
import { CategoryEditor } from "../components/CategoryEditor";
import type { DecryptedTransaction } from "../types/dashboard";

/** Hook that fetches and decrypts the category overrides config blob. */
function useCategoryOverrides(): {
  overrides: CategoryOverrides;
  isLoading: boolean;
} {
  const { token, dek } = useAuth();

  const query = useQuery({
    queryKey: ["config:category_overrides"],
    queryFn: () => fetchOverrides(token!, dek!),
    enabled: !!token && !!dek,
    staleTime: 5 * 60 * 1000,
  });

  return {
    overrides: query.data ?? {},
    isLoading: query.isLoading,
  };
}

/** Hook that fetches and decrypts all transactions. */
function useDecryptedTransactions(overrides: CategoryOverrides) {
  const { token, dek } = useAuth();

  const transactionsQuery = useQuery({
    queryKey: ["transactions"],
    queryFn: () => listTransactions(token!),
    enabled: !!token,
  });

  const decryptedQuery = useQuery({
    queryKey: [
      "transactions:decrypted",
      transactionsQuery.data?.length,
      Object.keys(overrides).length,
    ],
    queryFn: async () => {
      if (!transactionsQuery.data || !dek) return [];
      return Promise.all(
        transactionsQuery.data.map((tx) => decryptTransaction(tx, dek, overrides))
      );
    },
    enabled: !!transactionsQuery.data && !!dek,
  });

  return {
    data: decryptedQuery.data ?? [],
    isLoading: transactionsQuery.isLoading || decryptedQuery.isLoading,
    isError: transactionsQuery.isError || decryptedQuery.isError,
    error: transactionsQuery.error ?? decryptedQuery.error,
  };
}

/** Formats a number as Brazilian Real currency. */
function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Manages category update mutations for individual transactions.
 *
 * Handles re-encrypting the payload with the new category, PUTting
 * to the API, saving the merchant→category override, and invalidating
 * queries to refresh the decrypted data.
 */
function useCategoryUpdate(overrides: CategoryOverrides) {
  const { token, dek } = useAuth();
  const queryClient = useQueryClient();
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const handleCategoryUpdate = useCallback(
    async (tx: DecryptedTransaction, newCategory: string) => {
      if (!token || !dek) return;

      setSavingIds((prev) => new Set(prev).add(tx.id));

      try {
        const encryptedPayload = await buildCategoryPayload(
          tx.description,
          newCategory,
          dek,
        );

        await updateTransaction(token, tx.id, {
          card_id: tx.card_id,
          encrypted_data: encryptedPayload.encrypted_data,
          iv: encryptedPayload.iv,
          auth_tag: encryptedPayload.auth_tag,
          timestamp_bucket: tx.timestamp_bucket,
        });

        // Persist override so future transactions from this merchant are
        // auto-categorized as "auto_learned"
        const updatedOverrides = addOverride(overrides, tx.merchant, newCategory);
        await saveOverrides(token, dek, updatedOverrides);

        await queryClient.invalidateQueries({ queryKey: ["transactions"] });
        await queryClient.invalidateQueries({
          queryKey: ["config:category_overrides"],
        });
      } catch (error) {
        console.error("Failed to update category:", error);
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(tx.id);
          return next;
        });
      }
    },
    [token, dek, queryClient, overrides],
  );

  return { handleCategoryUpdate, savingIds };
}

export function DashboardPage() {
  const { token, dek } = useAuth();
  const { filters, updateFilter, clearFilters, hasActiveFilters } =
    useFilters();

  // Default to current month if no month filter is set
  const defaultBucket = currentBucket();
  useEffect(() => {
    if (!filters.month) {
      updateFilter("month", defaultBucket);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeMonth = filters.month ?? defaultBucket;

  const cards = useQuery({
    queryKey: ["cards"],
    queryFn: () => listCards(token!),
    enabled: !!token,
  });

  const decryptedCards = useQuery({
    queryKey: ["cards:decrypted", cards.data?.length],
    queryFn: async () => {
      if (!cards.data || !dek) return [];
      return Promise.all(cards.data.map((c) => decryptCard(c, dek)));
    },
    enabled: !!cards.data && !!dek,
  });

  const cardLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of decryptedCards.data ?? []) {
      map.set(c.id, formatCardLabel(c.label, c.last_digits));
    }
    return map;
  }, [decryptedCards.data]);

  const { overrides } = useCategoryOverrides();
  const { data: allTransactions, isLoading, isError, error } =
    useDecryptedTransactions(overrides);

  const { handleCategoryUpdate, savingIds } = useCategoryUpdate(overrides);

  const categorySuggestions = useMemo(
    () => extractUniqueCategories(allTransactions),
    [allTransactions],
  );

  // Apply filters then sort by date descending
  const filtered = useMemo(() => {
    const matched = filterTransactions(allTransactions, filters);
    return sortByDateDescending(matched);
  }, [allTransactions, filters]);

  const totalAmount = useMemo(
    () => filtered.reduce((sum, tx) => sum + tx.amount, 0),
    [filtered]
  );

  function goToPreviousMonth() {
    updateFilter("month", navigateMonth(activeMonth, -1));
  }

  function goToNextMonth() {
    updateFilter("month", navigateMonth(activeMonth, 1));
  }

  function goToCurrentMonth() {
    updateFilter("month", defaultBucket);
  }

  const isCurrentMonth = activeMonth === defaultBucket;

  return (
    <div className="space-y-6">
      {/* Header with month navigation */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            All data is decrypted client-side &middot;{" "}
            {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Month pagination */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToPreviousMonth}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700 hover:bg-gray-50"
            aria-label="Previous month"
          >
            &larr;
          </button>
          <button
            onClick={goToCurrentMonth}
            className={`rounded-md px-3 py-1 text-sm font-medium ${
              isCurrentMonth
                ? "bg-blue-600 text-white"
                : "border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {formatBucket(activeMonth)}
          </button>
          <button
            onClick={goToNextMonth}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700 hover:bg-gray-50"
            aria-label="Next month"
          >
            &rarr;
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard
          label="Cards"
          value={cards.data?.length ?? "..."}
          loading={cards.isLoading}
        />
        <StatCard
          label="Transactions"
          value={filtered.length}
          loading={isLoading}
        />
        <StatCard
          label="Total"
          value={isLoading ? "..." : formatBRL(totalAmount)}
          loading={false}
        />
        <StatCard
          label="Avg"
          value={
            isLoading || filtered.length === 0
              ? "..."
              : formatBRL(totalAmount / filtered.length)
          }
          loading={false}
        />
      </div>

      {/* Charts */}
      {!isLoading && <SpendingCharts transactions={filtered} />}

      {/* Filters */}
      <FilterBar
        filters={filters}
        onFilterChange={updateFilter}
        onClear={clearFilters}
        hasActiveFilters={hasActiveFilters}
        transactions={allTransactions}
        cardLabels={cardLabels}
      />

      {/* Transaction list */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-medium text-gray-900">
            Transactions
            {hasActiveFilters && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({filtered.length} of {allTransactions.length})
              </span>
            )}
          </h2>
        </div>

        {isLoading ? (
          <p className="p-4 text-sm text-gray-500">
            Loading and decrypting...
          </p>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-sm text-gray-500">
              {hasActiveFilters
                ? "No transactions match your filters."
                : "No transactions yet."}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {tx.merchant}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-gray-500">
                    {formatTransactionDate(tx.created_at)}
                    {" · "}
                    <CategoryEditor
                      category={tx.category}
                      suggestions={categorySuggestions}
                      onSave={(newCategory) =>
                        handleCategoryUpdate(tx, newCategory)
                      }
                      isSaving={savingIds.has(tx.id)}
                      categorySource={tx.category_source}
                    />
                    {" · "}
                    <span className="text-gray-400">
                      {cardLabels.get(tx.card_id) ?? `${tx.card_id.slice(0, 8)}...`}
                    </span>
                  </p>
                </div>
                <span className="ml-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                  {formatBRL(tx.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isError && (
        <p className="text-sm text-red-600">
          Failed to load transactions: {error?.message}
        </p>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string | number;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">
        {loading ? "..." : value}
      </p>
    </div>
  );
}
