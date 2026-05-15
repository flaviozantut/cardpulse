/**
 * Card management page for viewing, adding, and deleting credit cards.
 *
 * All card data is encrypted client-side before being sent to the API
 * and decrypted client-side after fetching. The server never sees plaintext.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Plus, Trash2, X } from "lucide-react";
import { listCards, createCard, deleteCard } from "../lib/api";
import { decryptCard, encryptCardData, formatCardLabel } from "../lib/card-data";
import { useAuth } from "../hooks/useAuth";

const BRAND_COLORS: Record<string, { bg: string; text: string }> = {
  Visa: { bg: "from-blue-600 to-blue-800", text: "Visa" },
  Mastercard: { bg: "from-red-500 to-orange-600", text: "Mastercard" },
  Elo: { bg: "from-yellow-500 to-amber-600", text: "Elo" },
  Amex: { bg: "from-teal-500 to-cyan-600", text: "Amex" },
  Hipercard: { bg: "from-red-600 to-rose-700", text: "Hipercard" },
  default: { bg: "from-slate-600 to-slate-800", text: "" },
};

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

  const addMutation = useMutation({
    mutationFn: async (formData: { label: string; last_digits: string; brand: string }) => {
      const encrypted = await encryptCardData(formData, dek!);
      return createCard(token!, encrypted);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      setShowForm(false);
    },
  });

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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Cards</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {cards.length} card{cards.length !== 1 ? "s" : ""} tracked
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          disabled={showForm}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60"
        >
          <Plus size={16} />
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

      {/* Card grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 py-16 text-center dark:border-slate-700">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
            <CreditCard size={24} className="text-slate-400" />
          </div>
          <div>
            <p className="font-medium text-slate-700 dark:text-slate-300">No cards yet</p>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Add your first card to get started.
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            <Plus size={14} />
            Add card
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const colors = BRAND_COLORS[card.brand] ?? BRAND_COLORS.default;
            return (
              <div
                key={card.id}
                className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${colors.bg} p-5 text-white shadow-md`}
              >
                {/* Background pattern */}
                <div className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/10" />
                <div className="pointer-events-none absolute -bottom-8 -right-4 h-24 w-24 rounded-full bg-white/10" />

                <div className="relative">
                  <div className="flex items-start justify-between">
                    <CreditCard size={24} className="opacity-90" />
                    {deleteConfirmId === card.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => deleteMutation.mutate(card.id)}
                          disabled={deleteMutation.isPending}
                          className="rounded-lg bg-white/20 px-2.5 py-1 text-xs font-medium hover:bg-white/30 disabled:opacity-50"
                        >
                          {deleteMutation.isPending ? "..." : "Delete"}
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="rounded-lg p-1 hover:bg-white/20"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(card.id)}
                        className="rounded-lg p-1 opacity-60 hover:bg-white/20 hover:opacity-100"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>

                  <div className="mt-4">
                    <p className="text-lg font-bold tracking-wide">
                      •••• {card.last_digits || "••••"}
                    </p>
                    <p className="mt-1 text-sm font-medium opacity-90">
                      {formatCardLabel(card.label, card.last_digits)}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs opacity-70">
                      Added {new Date(card.created_at).toLocaleDateString("pt-BR")}
                    </span>
                    {card.brand && (
                      <span className="rounded-md bg-white/20 px-2 py-0.5 text-xs font-semibold">
                        {card.brand}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isError && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          Failed to load cards: {error?.message}
        </div>
      )}
    </div>
  );
}

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
    onSubmit({ label: label.trim(), last_digits: lastDigits.trim(), brand: brand.trim() });
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40";

  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5 dark:border-indigo-900/40 dark:bg-indigo-950/20">
      <h3 className="mb-4 font-semibold text-slate-900 dark:text-slate-100">New card</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="card-label" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Card name *
            </label>
            <input
              id="card-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Nubank Platinum"
              required
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="card-digits" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
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
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="card-brand" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Brand
            </label>
            <select
              id="card-brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className={inputClass}
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
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {isSubmitting ? "Encrypting & saving..." : "Save card"}
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
