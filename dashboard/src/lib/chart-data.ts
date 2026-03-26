/**
 * Chart data aggregation from decrypted transactions.
 *
 * All computations happen client-side on already-decrypted data.
 * These functions transform transaction lists into chart-ready formats.
 */

import type { DecryptedTransaction } from "../types/dashboard";

/** Data point for the monthly bar chart. */
export interface MonthlyData {
  month: string;
  total: number;
}

/** Data point for the category pie chart. */
export interface CategoryData {
  category: string;
  total: number;
}

/** Data point for the daily trend line. */
export interface DailyData {
  day: string;
  total: number;
}

/**
 * Aggregates spending by month (timestamp_bucket).
 *
 * Returns data sorted by month ascending, suitable for a bar chart.
 */
export function aggregateByMonth(
  transactions: DecryptedTransaction[]
): MonthlyData[] {
  const map = new Map<string, number>();

  for (const tx of transactions) {
    const current = map.get(tx.timestamp_bucket) ?? 0;
    map.set(tx.timestamp_bucket, current + tx.amount);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({
      month,
      total: Math.round(total * 100) / 100,
    }));
}

/**
 * Aggregates spending by category.
 *
 * Returns data sorted by total descending, suitable for a pie chart.
 */
export function aggregateByCategory(
  transactions: DecryptedTransaction[]
): CategoryData[] {
  const map = new Map<string, number>();

  for (const tx of transactions) {
    const current = map.get(tx.category) ?? 0;
    map.set(tx.category, current + tx.amount);
  }

  return Array.from(map.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([category, total]) => ({
      category,
      total: Math.round(total * 100) / 100,
    }));
}

/**
 * Aggregates spending by day (YYYY-MM-DD from created_at).
 *
 * Returns data sorted by day ascending, suitable for a trend line chart.
 */
export function aggregateByDay(
  transactions: DecryptedTransaction[]
): DailyData[] {
  const map = new Map<string, number>();

  for (const tx of transactions) {
    const day = tx.created_at.slice(0, 10);
    const current = map.get(day) ?? 0;
    map.set(day, current + tx.amount);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, total]) => ({
      day,
      total: Math.round(total * 100) / 100,
    }));
}
