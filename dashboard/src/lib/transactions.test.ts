import { describe, it, expect } from "vitest";
import {
  sortByDateDescending,
  formatTransactionDate,
  getMonthBuckets,
  navigateMonth,
  currentBucket,
} from "./transactions";
import type { DecryptedTransaction } from "../types/dashboard";

function makeTx(
  overrides: Partial<DecryptedTransaction> = {}
): DecryptedTransaction {
  return {
    id: "tx-1",
    card_id: "card-1",
    timestamp_bucket: "2026-03",
    created_at: "2026-03-15T10:00:00Z",
    merchant: "Test Merchant",
    amount: 10,
    category: "test",
    description: "Test",
    ...overrides,
  };
}

describe("sortByDateDescending", () => {
  it("sorts transactions by created_at descending (newest first)", () => {
    const transactions = [
      makeTx({ id: "old", created_at: "2026-03-01T08:00:00Z" }),
      makeTx({ id: "newest", created_at: "2026-03-25T18:00:00Z" }),
      makeTx({ id: "mid", created_at: "2026-03-15T12:00:00Z" }),
    ];

    const sorted = sortByDateDescending(transactions);

    expect(sorted.map((t) => t.id)).toEqual(["newest", "mid", "old"]);
  });

  it("does not mutate the original array", () => {
    const original = [
      makeTx({ id: "a", created_at: "2026-03-01T00:00:00Z" }),
      makeTx({ id: "b", created_at: "2026-03-02T00:00:00Z" }),
    ];
    const copy = [...original];

    sortByDateDescending(original);

    expect(original.map((t) => t.id)).toEqual(copy.map((t) => t.id));
  });

  it("handles empty array", () => {
    expect(sortByDateDescending([])).toEqual([]);
  });

  it("handles single transaction", () => {
    const single = [makeTx({ id: "only" })];
    expect(sortByDateDescending(single)).toHaveLength(1);
  });
});

describe("formatTransactionDate", () => {
  it("formats ISO date to readable format", () => {
    const result = formatTransactionDate("2026-03-15T10:30:00Z");
    // Should contain day, month info
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it("formats different dates consistently", () => {
    const a = formatTransactionDate("2026-03-15T10:00:00Z");
    const b = formatTransactionDate("2026-03-15T10:00:00Z");
    expect(a).toBe(b);
  });

  it("produces different results for different dates", () => {
    const a = formatTransactionDate("2026-03-15T10:00:00Z");
    const b = formatTransactionDate("2026-04-20T10:00:00Z");
    expect(a).not.toBe(b);
  });
});

describe("getMonthBuckets", () => {
  it("extracts unique sorted months from transactions", () => {
    const transactions = [
      makeTx({ timestamp_bucket: "2026-03" }),
      makeTx({ timestamp_bucket: "2026-01" }),
      makeTx({ timestamp_bucket: "2026-03" }),
      makeTx({ timestamp_bucket: "2026-02" }),
    ];

    const buckets = getMonthBuckets(transactions);

    expect(buckets).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("returns empty array for no transactions", () => {
    expect(getMonthBuckets([])).toEqual([]);
  });
});

describe("navigateMonth", () => {
  it("goes to next month", () => {
    expect(navigateMonth("2026-03", 1)).toBe("2026-04");
  });

  it("goes to previous month", () => {
    expect(navigateMonth("2026-03", -1)).toBe("2026-02");
  });

  it("handles year boundary forward (Dec → Jan)", () => {
    expect(navigateMonth("2026-12", 1)).toBe("2027-01");
  });

  it("handles year boundary backward (Jan → Dec)", () => {
    expect(navigateMonth("2026-01", -1)).toBe("2025-12");
  });

  it("pads month with zero", () => {
    expect(navigateMonth("2026-09", 1)).toBe("2026-10");
    expect(navigateMonth("2026-10", -1)).toBe("2026-09");
  });
});

describe("currentBucket", () => {
  it("returns a string in YYYY-MM format", () => {
    const bucket = currentBucket();
    expect(bucket).toMatch(/^\d{4}-\d{2}$/);
  });
});
