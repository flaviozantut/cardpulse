import { describe, it, expect } from "vitest";
import {
  type TransactionFilters,
  filterTransactions,
  parseFiltersFromParams,
  filtersToParams,
} from "./filters";
import type { DecryptedTransaction } from "../types/dashboard";

function makeTx(
  overrides: Partial<DecryptedTransaction> = {}
): DecryptedTransaction {
  return {
    id: "tx-1",
    card_id: "card-1",
    timestamp_bucket: "2026-03",
    created_at: "2026-03-15T10:00:00Z",
    merchant: "Mercado Extra",
    amount: 35.94,
    category: "groceries",
    description: "Mercado Extra R$ 35,94",
    ...overrides,
  };
}

describe("filterTransactions", () => {
  const transactions: DecryptedTransaction[] = [
    makeTx({
      id: "tx-1",
      card_id: "card-a",
      timestamp_bucket: "2026-03",
      merchant: "Mercado Extra",
      amount: 35.94,
      category: "groceries",
    }),
    makeTx({
      id: "tx-2",
      card_id: "card-b",
      timestamp_bucket: "2026-03",
      merchant: "Shell Posto",
      amount: 250.0,
      category: "transport",
      description: "Shell Posto R$ 250,00",
    }),
    makeTx({
      id: "tx-3",
      card_id: "card-a",
      timestamp_bucket: "2026-02",
      merchant: "Padaria São João",
      amount: 12.5,
      category: "food",
      description: "Padaria São João R$ 12,50",
    }),
    makeTx({
      id: "tx-4",
      card_id: "card-b",
      timestamp_bucket: "2026-03",
      merchant: "Netflix",
      amount: 55.9,
      category: "entertainment",
      description: "Netflix R$ 55,90",
    }),
  ];

  it("returns all transactions when no filters are active", () => {
    const filters: TransactionFilters = {};
    const result = filterTransactions(transactions, filters);
    expect(result).toHaveLength(4);
  });

  it("filters by month (timestamp_bucket)", () => {
    const filters: TransactionFilters = { month: "2026-03" };
    const result = filterTransactions(transactions, filters);
    expect(result).toHaveLength(3);
    expect(result.every((t) => t.timestamp_bucket === "2026-03")).toBe(true);
  });

  it("filters by card_id", () => {
    const filters: TransactionFilters = { cardId: "card-a" };
    const result = filterTransactions(transactions, filters);
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.card_id === "card-a")).toBe(true);
  });

  it("filters by category", () => {
    const filters: TransactionFilters = { category: "groceries" };
    const result = filterTransactions(transactions, filters);
    expect(result).toHaveLength(1);
    expect(result[0].merchant).toBe("Mercado Extra");
  });

  it("filters by minimum amount", () => {
    const filters: TransactionFilters = { amountMin: 50 };
    const result = filterTransactions(transactions, filters);
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.amount >= 50)).toBe(true);
  });

  it("filters by maximum amount", () => {
    const filters: TransactionFilters = { amountMax: 40 };
    const result = filterTransactions(transactions, filters);
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.amount <= 40)).toBe(true);
  });

  it("filters by amount range", () => {
    const filters: TransactionFilters = { amountMin: 10, amountMax: 50 };
    const result = filterTransactions(transactions, filters);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id).sort()).toEqual(["tx-1", "tx-3"]);
  });

  it("searches by merchant name (case-insensitive substring)", () => {
    const filters: TransactionFilters = { search: "mercado" };
    const result = filterTransactions(transactions, filters);
    expect(result).toHaveLength(1);
    expect(result[0].merchant).toBe("Mercado Extra");
  });

  it("searches by merchant name with partial match", () => {
    const filters: TransactionFilters = { search: "shell" };
    const result = filterTransactions(transactions, filters);
    expect(result).toHaveLength(1);
    expect(result[0].merchant).toBe("Shell Posto");
  });

  it("searches across description field too", () => {
    const filters: TransactionFilters = { search: "R$ 35" };
    const result = filterTransactions(transactions, filters);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("tx-1");
  });

  it("combines multiple filters (month + card + search)", () => {
    const filters: TransactionFilters = {
      month: "2026-03",
      cardId: "card-b",
      search: "shell",
    };
    const result = filterTransactions(transactions, filters);
    expect(result).toHaveLength(1);
    expect(result[0].merchant).toBe("Shell Posto");
  });

  it("returns empty when no transactions match combined filters", () => {
    const filters: TransactionFilters = {
      month: "2026-03",
      category: "food",
    };
    const result = filterTransactions(transactions, filters);
    expect(result).toHaveLength(0);
  });

  it("handles empty transaction list", () => {
    const result = filterTransactions([], { search: "anything" });
    expect(result).toHaveLength(0);
  });
});

describe("parseFiltersFromParams", () => {
  it("parses all filter params from URLSearchParams", () => {
    const params = new URLSearchParams(
      "month=2026-03&card=card-a&category=food&min=10&max=100&q=mercado"
    );
    const filters = parseFiltersFromParams(params);

    expect(filters.month).toBe("2026-03");
    expect(filters.cardId).toBe("card-a");
    expect(filters.category).toBe("food");
    expect(filters.amountMin).toBe(10);
    expect(filters.amountMax).toBe(100);
    expect(filters.search).toBe("mercado");
  });

  it("returns empty filters for empty params", () => {
    const filters = parseFiltersFromParams(new URLSearchParams());
    expect(filters).toEqual({});
  });

  it("ignores invalid numeric values", () => {
    const params = new URLSearchParams("min=abc&max=xyz");
    const filters = parseFiltersFromParams(params);
    expect(filters.amountMin).toBeUndefined();
    expect(filters.amountMax).toBeUndefined();
  });
});

describe("filtersToParams", () => {
  it("converts filters to URLSearchParams", () => {
    const filters: TransactionFilters = {
      month: "2026-03",
      cardId: "card-a",
      category: "food",
      amountMin: 10,
      amountMax: 100,
      search: "mercado",
    };
    const params = filtersToParams(filters);

    expect(params.get("month")).toBe("2026-03");
    expect(params.get("card")).toBe("card-a");
    expect(params.get("category")).toBe("food");
    expect(params.get("min")).toBe("10");
    expect(params.get("max")).toBe("100");
    expect(params.get("q")).toBe("mercado");
  });

  it("omits undefined filter values", () => {
    const filters: TransactionFilters = { month: "2026-03" };
    const params = filtersToParams(filters);

    expect(params.get("month")).toBe("2026-03");
    expect(params.has("card")).toBe(false);
    expect(params.has("q")).toBe(false);
  });

  it("returns empty params for empty filters", () => {
    const params = filtersToParams({});
    expect(params.toString()).toBe("");
  });

  it("roundtrips: filters → params → filters", () => {
    const original: TransactionFilters = {
      month: "2026-03",
      cardId: "card-a",
      search: "test",
      amountMin: 5,
      amountMax: 200,
    };
    const params = filtersToParams(original);
    const restored = parseFiltersFromParams(params);
    expect(restored).toEqual(original);
  });
});
