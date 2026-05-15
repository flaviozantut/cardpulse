/**
 * Transaction management page for viewing, adding, editing, and deleting transactions.
 *
 * All transaction data is encrypted client-side before being sent to the API
 * and decrypted client-side after fetching. The server never sees plaintext.
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Plus, Trash2, X } from "lucide-react";
import {
  listCards,
  listTransactions,
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from "../lib/api";
import { decryptCard, formatCardLabel } from "../lib/card-data";
import {
  decryptTransaction,
  encryptTransactionData,
  currentTimestampBucket,
} from "../lib/transaction-data";
import { buildCategoryPayload, extractUniqueCategories } from "../lib/categories";
import { fetchOverrides, saveOverrides, addOverride } from "../lib/overrides";
import type { CategoryOverrides } from "../lib/overrides";
import { formatTransactionDate } from "../lib/transactions";
import { useAuth } from "../hooks/useAuth";
import { CategoryEditor } from "../components/CategoryEditor";
import type { DecryptedTransaction } from "../types/dashboard";

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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
        transactionsQuery.data.map((tx) => decryptTransaction(tx, dek, overrides)),
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

function useDecryptedCards() {
  const { token, dek } = useAuth();

  const cardsQuery = useQuery({
    queryKey: ["cards"],
    queryFn: () => listCards(token!),
    enabled: !!token,
  });

  const decryptedQuery = useQuery({
    queryKey: ["cards:decrypted", cardsQuery.data?.length],
    queryFn: async () => {
      if (!cardsQuery.data || !dek) return [];
      return Promise.all(cardsQuery.data.map((card) => decryptCard(card, dek)));
    },
    enabled: !!cardsQuery.data && !!dek,
  });

  return {
    data: decryptedQuery.data ?? [],
    isLoading: cardsQuery.isLoading || decryptedQuery.isLoading,
  };
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

export function TransactionsPage() {
  const { token, dek } = useAuth();
  const queryClient = useQueryClient();
  const { overrides } = useCategoryOverrides();
  const { data: transactions, isLoading, isError, error } = useDecryptedTransactions(overrides);
  const { data: cards } = useDecryptedCards();

  const [showForm, setShowForm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { handleCategoryUpdate, savingIds } = useCategoryUpdate(overrides);

  const categorySuggestions = useMemo(
    () => extractUniqueCategories(transactions),
    [transactions],
  );

  const cardLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cards) {
      map.set(c.id, formatCardLabel(c.label, c.last_digits));
    }
    return map;
  }, [cards]);

  const sorted = useMemo(
    () =>
      [...transactions].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [transactions],
  );

  const addMutation = useMutation({
    mutationFn: async (formData: {
      card_id: string;
      merchant: string;
      amount: number;
      category: string;
      timestamp_bucket: string;
    }) => {
      const encrypted = await encryptTransactionData(
        { merchant: formData.merchant, amount: formData.amount, category: formData.category },
        dek!,
      );
      return createTransaction(token!, {
        card_id: formData.card_id,
        encrypted_data: encrypted.encrypted_data,
        iv: encrypted.iv,
        auth_tag: encrypted.auth_tag,
        timestamp_bucket: formData.timestamp_bucket,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setShowForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTransaction(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setDeleteConfirmId(null);
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Transactions</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {transactions.length} total
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          disabled={showForm}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60"
        >
          <Plus size={16} />
          Add transaction
        </button>
      </div>

      {showForm && (
        <AddTransactionForm
          cards={cards.map((c) => ({ id: c.id, label: formatCardLabel(c.label, c.last_digits) }))}
          categorySuggestions={categorySuggestions}
          onSubmit={(data) => addMutation.mutate(data)}
          onCancel={() => setShowForm(false)}
          isSubmitting={addMutation.isPending}
          error={addMutation.error?.message}
        />
      )}

      {/* List */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">All transactions</h2>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-3 p-5">
            {[...Array(5)].map((_, i) => (
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
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
              <ArrowLeftRight size={22} className="text-slate-400" />
            </div>
            <div>
              <p className="font-medium text-slate-700 dark:text-slate-300">No transactions yet</p>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Add your first transaction to get started.
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-50 dark:divide-slate-800/60">
            {sorted.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                {/* Avatar */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 text-sm font-semibold text-slate-600 dark:from-slate-800 dark:to-slate-700 dark:text-slate-300">
                  {tx.merchant.trim()[0]?.toUpperCase() ?? "?"}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {tx.merchant}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span>{formatTransactionDate(tx.created_at)}</span>
                    <span>·</span>
                    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${categoryBadgeColor(tx.category)}`}>
                      <CategoryEditor
                        category={tx.category}
                        suggestions={categorySuggestions}
                        onSave={(cat) => handleCategoryUpdate(tx, cat)}
                        isSaving={savingIds.has(tx.id)}
                        categorySource={tx.category_source}
                      />
                    </span>
                    <span>·</span>
                    <span className="text-slate-400 dark:text-slate-500">
                      {cardLabels.get(tx.card_id) ?? `${tx.card_id.slice(0, 8)}...`}
                    </span>
                  </div>
                </div>

                {/* Amount + delete */}
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {formatBRL(tx.amount)}
                  </span>

                  {deleteConfirmId === tx.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => deleteMutation.mutate(tx.id)}
                        disabled={deleteMutation.isPending}
                        className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
                      >
                        {deleteMutation.isPending ? "..." : "Delete"}
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(tx.id)}
                      className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 dark:text-slate-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </li>
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

function AddTransactionForm({
  cards,
  categorySuggestions,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
}: {
  cards: { id: string; label: string }[];
  categorySuggestions: string[];
  onSubmit: (data: {
    card_id: string;
    merchant: string;
    amount: number;
    category: string;
    timestamp_bucket: string;
  }) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error?: string;
}) {
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [bucket, setBucket] = useState(currentTimestampBucket());

  const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!merchant.trim() || !amount || !cardId) return;
    onSubmit({
      card_id: cardId,
      merchant: merchant.trim(),
      amount: parseFloat(amount),
      category: category.trim() || "uncategorized",
      timestamp_bucket: bucket,
    });
  }

  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5 dark:border-indigo-900/40 dark:bg-indigo-950/20">
      <h3 className="mb-4 font-semibold text-slate-900 dark:text-slate-100">New transaction</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor="tx-card" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Card *
            </label>
            <select id="tx-card" value={cardId} onChange={(e) => setCardId(e.target.value)} required className={inputClass}>
              {cards.length === 0 && <option value="">No cards available</option>}
              {cards.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="tx-merchant" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Merchant *
            </label>
            <input
              id="tx-merchant"
              type="text"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="e.g. Shell"
              required
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="tx-amount" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Amount (R$) *
            </label>
            <input
              id="tx-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="tx-category" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Category
            </label>
            <input
              id="tx-category"
              type="text"
              list="tx-category-suggestions"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. food"
              className={inputClass}
            />
            <datalist id="tx-category-suggestions">
              {categorySuggestions.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>

          <div>
            <label htmlFor="tx-bucket" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Month
            </label>
            <input
              id="tx-bucket"
              type="month"
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isSubmitting || !merchant.trim() || !amount || !cardId}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {isSubmitting ? "Encrypting & saving..." : "Save transaction"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
