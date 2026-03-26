import { describe, it, expect } from "vitest";
import {
  aggregateByMonth,
  aggregateByCategory,
  aggregateByDay,
} from "./chart-data";
import type { DecryptedTransaction } from "../types/dashboard";

function makeTx(
  overrides: Partial<DecryptedTransaction> = {}
): DecryptedTransaction {
  return {
    id: "tx-1",
    card_id: "card-1",
    timestamp_bucket: "2026-03",
    created_at: "2026-03-15T10:00:00Z",
    merchant: "Test",
    amount: 10,
    category: "test",
    description: "Test",
    ...overrides,
  };
}

describe("aggregateByMonth", () => {
  it("sums amounts by timestamp_bucket", () => {
    const transactions = [
      makeTx({ timestamp_bucket: "2026-01", amount: 100 }),
      makeTx({ timestamp_bucket: "2026-01", amount: 50 }),
      makeTx({ timestamp_bucket: "2026-02", amount: 200 }),
      makeTx({ timestamp_bucket: "2026-03", amount: 75 }),
    ];

    const result = aggregateByMonth(transactions);

    expect(result).toEqual([
      { month: "2026-01", total: 150 },
      { month: "2026-02", total: 200 },
      { month: "2026-03", total: 75 },
    ]);
  });

  it("returns sorted by month ascending", () => {
    const transactions = [
      makeTx({ timestamp_bucket: "2026-03", amount: 10 }),
      makeTx({ timestamp_bucket: "2026-01", amount: 20 }),
    ];

    const result = aggregateByMonth(transactions);
    expect(result[0].month).toBe("2026-01");
    expect(result[1].month).toBe("2026-03");
  });

  it("handles empty array", () => {
    expect(aggregateByMonth([])).toEqual([]);
  });

  it("rounds totals to two decimal places", () => {
    const transactions = [
      makeTx({ timestamp_bucket: "2026-01", amount: 10.1 }),
      makeTx({ timestamp_bucket: "2026-01", amount: 20.2 }),
    ];

    const result = aggregateByMonth(transactions);
    expect(result[0].total).toBe(30.3);
  });
});

describe("aggregateByCategory", () => {
  it("sums amounts by category", () => {
    const transactions = [
      makeTx({ category: "groceries", amount: 100 }),
      makeTx({ category: "transport", amount: 50 }),
      makeTx({ category: "groceries", amount: 75 }),
    ];

    const result = aggregateByCategory(transactions);

    expect(result).toContainEqual({ category: "groceries", total: 175 });
    expect(result).toContainEqual({ category: "transport", total: 50 });
  });

  it("returns sorted by total descending", () => {
    const transactions = [
      makeTx({ category: "small", amount: 10 }),
      makeTx({ category: "big", amount: 500 }),
      makeTx({ category: "medium", amount: 100 }),
    ];

    const result = aggregateByCategory(transactions);
    expect(result[0].category).toBe("big");
    expect(result[1].category).toBe("medium");
    expect(result[2].category).toBe("small");
  });

  it("handles empty array", () => {
    expect(aggregateByCategory([])).toEqual([]);
  });
});

describe("aggregateByDay", () => {
  it("sums amounts by day (YYYY-MM-DD)", () => {
    const transactions = [
      makeTx({ created_at: "2026-03-15T08:00:00Z", amount: 30 }),
      makeTx({ created_at: "2026-03-15T18:00:00Z", amount: 20 }),
      makeTx({ created_at: "2026-03-16T10:00:00Z", amount: 50 }),
    ];

    const result = aggregateByDay(transactions);

    expect(result).toEqual([
      { day: "2026-03-15", total: 50 },
      { day: "2026-03-16", total: 50 },
    ]);
  });

  it("returns sorted by day ascending", () => {
    const transactions = [
      makeTx({ created_at: "2026-03-20T10:00:00Z", amount: 10 }),
      makeTx({ created_at: "2026-03-01T10:00:00Z", amount: 20 }),
    ];

    const result = aggregateByDay(transactions);
    expect(result[0].day).toBe("2026-03-01");
    expect(result[1].day).toBe("2026-03-20");
  });

  it("handles empty array", () => {
    expect(aggregateByDay([])).toEqual([]);
  });
});
