/**
 * Main dashboard page showing decrypted transactions with filters.
 *
 * Fetches encrypted data from the API, decrypts client-side using
 * the DEK, sorts by date descending, and applies client-side filters.
 * Defaults to the current month with prev/next month navigation.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard,
  ArrowLeftRight,
  TrendingUp,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
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

function useCategoryOverrides(): { overrides: CategoryOverrides; isLoading: boolean } {
  const { token, dek } = useAuth();
  const query = useQuery({
    queryKey: ["config:category_overrides"],
    queryFn: () => fetchOverrides(token!, dek!),
    enabled: !!token && !!dek,
    staleTime: 5 * 60 * 1000,
  });
  return { overrides: query.data ?? {}, isLoading: query.isLoading };
}

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

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function useCategoryUpdate(overrides: CategoryOverrides) {
  const { token, dek } = useAuth();
  const queryClient = useQueryClient();
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const handleCategoryUpdate = useCallback(
    async (tx: DecryptedTransaction, newCategory: string) => {
      if (!token || !dek) return;
      setSavingIds((prev) => new Set(prev).add(tx.id));
      try {
        const encryptedPayload = await buildCategoryPayload(tx.description, newCategory, dek);
        await updateTransaction(token, tx.id, {
          card_id: tx.card_id,
          encrypted_data: encryptedPayload.encrypted_data,
          iv: encryptedPayload.iv,
          auth_tag: encryptedPayload.auth_tag,
          timestamp_bucket: tx.timestamp_bucket,
        });
        const updatedOverrides = addOverride(overrides, tx.merchant, newCategory);
        await saveOverrides(token, dek, updatedOverrides);
        await queryClient.invalidateQueries({ queryKey: ["transactions"] });
        await queryClient.invalidateQueries({ queryKey: ["config:category_overrides"] });
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
  const { filters, updateFilter, clearFilters, hasActiveFilters } = useFilters();

  const defaultBucket = currentBucket();
  useEffect(() => {
    if (!filters.month) updateFilter("month", defaultBucket);
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

  const filtered = useMemo(() => {
    const matched = filterTransactions(allTransactions, filters);
    return sortByDateDescending(matched);
  }, [allTransactions, filters]);

  const totalAmount = useMemo(
    () => filtered.reduce((sum, tx) => sum + tx.amount, 0),
    [filtered],
  );

  const isCurrentMonth = activeMonth === defaultBucket;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h1>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
            <ShieldCheck size={13} className="text-emerald-500" />
            Decrypted client-side &middot; {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => updateFilter("month", navigateMonth(activeMonth, -1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => updateFilter("month", defaultBucket)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              isCurrentMonth
                ? "bg-indigo-600 text-white shadow-sm dark:bg-indigo-500"
                : "border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            {formatBucket(activeMonth)}
          </button>
          <button
            onClick={() => updateFilter("month", navigateMonth(activeMonth, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Cards"
          value={cards.data?.length ?? 0}
          loading={cards.isLoading}
          icon={CreditCard}
          iconColor="text-violet-500"
          iconBg="bg-violet-50 dark:bg-violet-950/40"
        />
        <StatCard
          label="Transactions"
          value={filtered.length}
          loading={isLoading}
          icon={ArrowLeftRight}
          iconColor="text-blue-500"
          iconBg="bg-blue-50 dark:bg-blue-950/40"
        />
        <StatCard
          label="Total"
          value={formatBRL(totalAmount)}
          loading={isLoading}
          icon={TrendingUp}
          iconColor="text-emerald-500"
          iconBg="bg-emerald-50 dark:bg-emerald-950/40"
        />
        <StatCard
          label="Average"
          value={filtered.length > 0 ? formatBRL(totalAmount / filtered.length) : "—"}
          loading={isLoading}
          icon={BarChart3}
          iconColor="text-amber-500"
          iconBg="bg-amber-50 dark:bg-amber-950/40"
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
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">
            Transactions
          </h2>
          {hasActiveFilters && (
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
              {filtered.length} of {allTransactions.length}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-3 p-5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-9 w-9 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
                  <div className="h-2.5 w-20 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
                </div>
                <div className="h-3 w-16 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <ArrowLeftRight size={32} className="text-slate-300 dark:text-slate-700" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {hasActiveFilters ? "No transactions match your filters." : "No transactions yet."}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-50 dark:divide-slate-800/60">
            {filtered.map((tx) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                cardLabel={cardLabels.get(tx.card_id) ?? `${tx.card_id.slice(0, 8)}...`}
                categorySuggestions={categorySuggestions}
                onCategoryUpdate={(cat) => handleCategoryUpdate(tx, cat)}
                isSaving={savingIds.has(tx.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {isError && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          Failed to load transactions: {error?.message}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
  icon: Icon,
  iconColor,
  iconBg,
}: {
  label: string;
  value: string | number;
  loading: boolean;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className={`mb-3 inline-flex rounded-lg p-2 ${iconBg}`}>
        <Icon size={16} className={iconColor} />
      </div>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-slate-900 dark:text-slate-100">
        {loading ? (
          <span className="inline-block h-6 w-20 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
        ) : (
          value
        )}
      </p>
    </div>
  );
}

function categoryBadgeColor(category: string): string {
  const map: Record<string, string> = {
    food: "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400",
    transport: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
    health: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
    entertainment: "bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400",
    shopping: "bg-pink-50 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400",
    utilities: "bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400",
    travel: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400",
    education: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400",
  };
  return map[category.toLowerCase()] ?? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
}

function merchantInitial(merchant: string): string {
  return merchant.trim()[0]?.toUpperCase() ?? "?";
}

function TransactionRow({
  tx,
  cardLabel,
  categorySuggestions,
  onCategoryUpdate,
  isSaving,
}: {
  tx: DecryptedTransaction;
  cardLabel: string;
  categorySuggestions: string[];
  onCategoryUpdate: (cat: string) => void;
  isSaving: boolean;
}) {
  return (
    <li className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40">
      {/* Avatar */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 text-sm font-semibold text-slate-600 dark:from-slate-800 dark:to-slate-700 dark:text-slate-300">
        {merchantInitial(tx.merchant)}
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
          {tx.merchant}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span>{formatTransactionDate(tx.created_at)}</span>
          <span>·</span>
          <span
            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${categoryBadgeColor(tx.category)}`}
          >
            <CategoryEditor
              category={tx.category}
              suggestions={categorySuggestions}
              onSave={onCategoryUpdate}
              isSaving={isSaving}
              categorySource={tx.category_source}
            />
          </span>
          <span>·</span>
          <span className="text-slate-400 dark:text-slate-500">{cardLabel}</span>
        </div>
      </div>

      {/* Amount */}
      <span className="shrink-0 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {tx.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
      </span>
    </li>
  );
}
