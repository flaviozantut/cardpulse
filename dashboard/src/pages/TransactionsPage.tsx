/**
 * Transaction management page for viewing, adding, editing, and deleting transactions.
 *
 * All transaction data is encrypted client-side before being sent to the API
 * and decrypted client-side after fetching. The server never sees plaintext.
 */

import { useState, useMemo, useCallback } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
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

/** Formats a number as Brazilian Real currency. */
function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

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
    // Overrides are user-specific config — no need for frequent refetching
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

/** Hook that fetches and decrypts all cards for the card selector. */
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
      return Promise.all(
        cardsQuery.data.map((card) => decryptCard(card, dek)),
      );
    },
    enabled: !!cardsQuery.data && !!dek,
  });

  return {
    data: decryptedQuery.data ?? [],
    isLoading: cardsQuery.isLoading || decryptedQuery.isLoading,
  };
}

/**
 * Manages inline category updates for individual transactions.
 *
 * Re-encrypts the transaction payload with the new category, PUTs to the API,
 * and also updates the merchant→category override map so future transactions
 * from the same merchant are auto-categorized with `category_source: "auto_learned"`.
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
        // 1. Re-encrypt transaction payload with updated category
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

        // 2. Persist override so future transactions from this merchant are
        //    auto-categorized as "auto_learned"
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

export function TransactionsPage() {
  const { token, dek } = useAuth();
  const queryClient = useQueryClient();
  const { overrides } = useCategoryOverrides();
  const { data: transactions, isLoading, isError, error } =
    useDecryptedTransactions(overrides);
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

  // Sort by date descending
  const sorted = useMemo(
    () =>
      [...transactions].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [transactions],
  );

  // ── Add transaction mutation ──
  const addMutation = useMutation({
    mutationFn: async (formData: {
      card_id: string;
      merchant: string;
      amount: number;
      category: string;
      timestamp_bucket: string;
    }) => {
      const encrypted = await encryptTransactionData(
        {
          merchant: formData.merchant,
          amount: formData.amount,
          category: formData.category,
        },
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

  // ── Delete transaction mutation ──
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
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Transactions
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage your transactions &middot; {transactions.length} total
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          disabled={showForm}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          Add transaction
        </button>
      </div>

      {/* Add transaction form */}
      {showForm && (
        <AddTransactionForm
          cards={cards.map((c) => ({
            id: c.id,
            label: formatCardLabel(c.label, c.last_digits),
          }))}
          categorySuggestions={categorySuggestions}
          onSubmit={(data) => addMutation.mutate(data)}
          onCancel={() => setShowForm(false)}
          isSubmitting={addMutation.isPending}
          error={addMutation.error?.message}
        />
      )}

      {/* Transaction list */}
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            All transactions
          </h2>
        </div>

        {isLoading ? (
          <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
            Loading and decrypting...
          </p>
        ) : sorted.length === 0 ? (
          <p className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
            No transactions yet. Add your first transaction to get started.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {sorted.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {tx.merchant}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
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
                    <span className="text-gray-400 dark:text-gray-500">
                      {cardLabels.get(tx.card_id) ??
                        `${tx.card_id.slice(0, 8)}...`}
                    </span>
                  </p>
                </div>

                <div className="ml-4 flex items-center gap-3">
                  <span className="whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {formatBRL(tx.amount)}
                  </span>

                  {deleteConfirmId === tx.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-600 dark:text-red-400">
                        Delete?
                      </span>
                      <button
                        onClick={() => deleteMutation.mutate(tx.id)}
                        disabled={deleteMutation.isPending}
                        className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {deleteMutation.isPending ? "..." : "Yes"}
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(tx.id)}
                      className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to load transactions: {error?.message}
        </p>
      )}
    </div>
  );
}

/** Form for adding a new transaction with client-side encryption. */
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
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40"
    >
      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
        Add new transaction
      </h3>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {/* Card selector */}
        <div>
          <label htmlFor="tx-card" className="block text-xs text-gray-600 dark:text-gray-300">
            Card *
          </label>
          <select
            id="tx-card"
            value={cardId}
            onChange={(e) => setCardId(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
          >
            {cards.length === 0 && <option value="">No cards available</option>}
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Merchant */}
        <div>
          <label htmlFor="tx-merchant" className="block text-xs text-gray-600 dark:text-gray-300">
            Merchant *
          </label>
          <input
            id="tx-merchant"
            type="text"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="e.g. Shell"
            required
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
        </div>

        {/* Amount */}
        <div>
          <label htmlFor="tx-amount" className="block text-xs text-gray-600 dark:text-gray-300">
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
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
        </div>

        {/* Category */}
        <div>
          <label htmlFor="tx-category" className="block text-xs text-gray-600 dark:text-gray-300">
            Category
          </label>
          <input
            id="tx-category"
            type="text"
            list="tx-category-suggestions"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. food"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
          <datalist id="tx-category-suggestions">
            {categorySuggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        {/* Month bucket */}
        <div>
          <label htmlFor="tx-bucket" className="block text-xs text-gray-600 dark:text-gray-300">
            Month
          </label>
          <input
            id="tx-bucket"
            type="month"
            value={bucket}
            onChange={(e) => setBucket(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={
            isSubmitting || !merchant.trim() || !amount || !cardId
          }
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          {isSubmitting ? "Encrypting & saving..." : "Save transaction"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md bg-gray-100 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
