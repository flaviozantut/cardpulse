/**
 * Main dashboard page showing decrypted transactions with filters.
 *
 * Fetches encrypted data from the API, decrypts client-side using
 * the DEK, sorts by date descending, and applies client-side filters.
 * Defaults to the current month with prev/next month navigation.
 */

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCards, listTransactions } from "../lib/api";
import { decrypt } from "../lib/crypto";
import { filterTransactions } from "../lib/filters";
import {
  sortByDateDescending,
  formatTransactionDate,
  navigateMonth,
  currentBucket,
  formatBucket,
} from "../lib/transactions";
import { useAuth } from "../hooks/useAuth";
import { useFilters } from "../hooks/useFilters";
import { FilterBar } from "../components/FilterBar";
import { SpendingCharts } from "../components/SpendingCharts";
import type { Transaction } from "../types/api";
import type { DecryptedTransaction } from "../types/dashboard";

/** Attempts to decrypt a transaction's encrypted_data and parse it. */
async function decryptTransaction(
  tx: Transaction,
  dek: Uint8Array
): Promise<DecryptedTransaction> {
  try {
    const plaintext = await decrypt(tx.encrypted_data, tx.iv, tx.auth_tag, dek);

    // Try to parse as JSON first (structured data from iOS client)
    try {
      const parsed = JSON.parse(plaintext);
      return {
        id: tx.id,
        card_id: tx.card_id,
        timestamp_bucket: tx.timestamp_bucket,
        created_at: tx.created_at,
        merchant: parsed.merchant ?? parsed.name ?? plaintext,
        amount: parsed.amount ?? 0,
        category: parsed.category ?? "uncategorized",
        description: plaintext,
      };
    } catch {
      // Plaintext is not JSON — treat as simple description string
      const amountMatch = plaintext.match(/R\$\s*([\d.,]+)/);
      const amount = amountMatch
        ? parseFloat(amountMatch[1].replace(".", "").replace(",", "."))
        : 0;

      return {
        id: tx.id,
        card_id: tx.card_id,
        timestamp_bucket: tx.timestamp_bucket,
        created_at: tx.created_at,
        merchant: plaintext.replace(/R\$\s*[\d.,]+/, "").trim() || plaintext,
        amount,
        category: "uncategorized",
        description: plaintext,
      };
    }
  } catch {
    return {
      id: tx.id,
      card_id: tx.card_id,
      timestamp_bucket: tx.timestamp_bucket,
      created_at: tx.created_at,
      merchant: "[Decryption failed]",
      amount: 0,
      category: "unknown",
      description: "[Unable to decrypt]",
    };
  }
}

/** Hook that fetches and decrypts all transactions. */
function useDecryptedTransactions() {
  const { token, dek } = useAuth();

  const transactionsQuery = useQuery({
    queryKey: ["transactions"],
    queryFn: () => listTransactions(token!),
    enabled: !!token,
  });

  const decryptedQuery = useQuery({
    queryKey: ["transactions:decrypted", transactionsQuery.data?.length],
    queryFn: async () => {
      if (!transactionsQuery.data || !dek) return [];
      return Promise.all(
        transactionsQuery.data.map((tx) => decryptTransaction(tx, dek))
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

export function DashboardPage() {
  const { token } = useAuth();
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

  const { data: allTransactions, isLoading, isError, error } =
    useDecryptedTransactions();

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
                  <p className="text-xs text-gray-500">
                    {formatTransactionDate(tx.created_at)}
                    {" · "}
                    {tx.category}
                    {" · "}
                    <span className="text-gray-400">
                      {tx.card_id.slice(0, 8)}...
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
