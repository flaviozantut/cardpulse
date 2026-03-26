/**
 * Transaction utilities for sorting, formatting, and month navigation.
 *
 * These functions operate on decrypted transaction data and handle
 * the display logic for the transaction list view.
 */

import type { DecryptedTransaction } from "../types/dashboard";

/**
 * Returns a new array of transactions sorted by created_at descending.
 *
 * Does not mutate the original array.
 */
export function sortByDateDescending(
  transactions: DecryptedTransaction[]
): DecryptedTransaction[] {
  return [...transactions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/**
 * Formats an ISO date string into a human-readable date.
 *
 * Uses pt-BR locale for Brazilian date formatting (DD/MM/YYYY HH:MM).
 */
export function formatTransactionDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Extracts unique month buckets from transactions, sorted chronologically.
 */
export function getMonthBuckets(
  transactions: DecryptedTransaction[]
): string[] {
  const buckets = new Set(transactions.map((t) => t.timestamp_bucket));
  return Array.from(buckets).sort();
}

/**
 * Navigates to a different month bucket by offset.
 *
 * @param bucket - Current month in "YYYY-MM" format
 * @param offset - Number of months to move (+1 = next, -1 = previous)
 * @returns The new month bucket in "YYYY-MM" format
 */
export function navigateMonth(bucket: string, offset: number): string {
  const [yearStr, monthStr] = bucket.split("-");
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10) + offset;

  while (month > 12) {
    month -= 12;
    year++;
  }
  while (month < 1) {
    month += 12;
    year--;
  }

  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Returns the current month bucket in "YYYY-MM" format. */
export function currentBucket(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

/**
 * Formats a month bucket ("YYYY-MM") into a human-readable label.
 *
 * Example: "2026-03" → "Mar 2026"
 */
export function formatBucket(bucket: string): string {
  const [year, month] = bucket.split("-");
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1);
  return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}
