/**
 * Card management page for viewing, adding, and deleting credit cards.
 *
 * All card data is encrypted client-side before being sent to the API
 * and decrypted client-side after fetching. The server never sees plaintext.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listCards, createCard, deleteCard } from "../lib/api";
import { decryptCard, encryptCardData, formatCardLabel } from "../lib/card-data";
import { useAuth } from "../hooks/useAuth";

/** Hook that fetches and decrypts all cards. */
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
    isError: cardsQuery.isError || decryptedQuery.isError,
    error: cardsQuery.error ?? decryptedQuery.error,
  };
}

export function CardsPage() {
  const { token, dek } = useAuth();
  const queryClient = useQueryClient();
  const { data: cards, isLoading, isError, error } = useDecryptedCards();

  const [showForm, setShowForm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // ── Add card mutation ──
  const addMutation = useMutation({
    mutationFn: async (formData: {
      label: string;
      last_digits: string;
      brand: string;
    }) => {
      const encrypted = await encryptCardData(formData, dek!);
      return createCard(token!, encrypted);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      setShowForm(false);
    },
  });

  // ── Delete card mutation ──
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCard(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      setDeleteConfirmId(null);
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Cards
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage your tracked credit cards &middot;{" "}
            {cards.length} card{cards.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          disabled={showForm}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          Add card
        </button>
      </div>

      {/* Add card form */}
      {showForm && (
        <AddCardForm
          onSubmit={(data) => addMutation.mutate(data)}
          onCancel={() => setShowForm(false)}
          isSubmitting={addMutation.isPending}
          error={addMutation.error?.message}
        />
      )}

      {/* Card list */}
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Your cards
          </h2>
        </div>

        {isLoading ? (
          <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
            Loading and decrypting...
          </p>
        ) : cards.length === 0 ? (
          <p className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
            No cards yet. Add your first card to get started.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {cards.map((card) => (
              <li
                key={card.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {formatCardLabel(card.label, card.last_digits)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {card.brand || "No brand"}
                    {" · "}
                    Added {new Date(card.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>

                {deleteConfirmId === card.id ? (
                  <div className="ml-4 flex items-center gap-2">
                    <span className="text-xs text-red-600 dark:text-red-400">
                      Delete?
                    </span>
                    <button
                      onClick={() => deleteMutation.mutate(card.id)}
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
                    onClick={() => setDeleteConfirmId(card.id)}
                    className="ml-4 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {isError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to load cards: {error?.message}
        </p>
      )}
    </div>
  );
}

/** Form for adding a new card with client-side encryption. */
function AddCardForm({
  onSubmit,
  onCancel,
  isSubmitting,
  error,
}: {
  onSubmit: (data: { label: string; last_digits: string; brand: string }) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error?: string;
}) {
  const [label, setLabel] = useState("");
  const [lastDigits, setLastDigits] = useState("");
  const [brand, setBrand] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    onSubmit({
      label: label.trim(),
      last_digits: lastDigits.trim(),
      brand: brand.trim(),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3 dark:border-blue-900 dark:bg-blue-950/40"
    >
      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
        Add new card
      </h3>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label
            htmlFor="card-label"
            className="block text-xs text-gray-600 dark:text-gray-300"
          >
            Card name *
          </label>
          <input
            id="card-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Nubank Platinum"
            required
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
        </div>

        <div>
          <label
            htmlFor="card-digits"
            className="block text-xs text-gray-600 dark:text-gray-300"
          >
            Last 4 digits
          </label>
          <input
            id="card-digits"
            type="text"
            value={lastDigits}
            onChange={(e) => setLastDigits(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="e.g. 4567"
            maxLength={4}
            pattern="\d{0,4}"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
        </div>

        <div>
          <label
            htmlFor="card-brand"
            className="block text-xs text-gray-600 dark:text-gray-300"
          >
            Brand
          </label>
          <select
            id="card-brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">Select...</option>
            <option value="Visa">Visa</option>
            <option value="Mastercard">Mastercard</option>
            <option value="Elo">Elo</option>
            <option value="Amex">Amex</option>
            <option value="Hipercard">Hipercard</option>
          </select>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting || !label.trim()}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          {isSubmitting ? "Encrypting & saving..." : "Save card"}
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
