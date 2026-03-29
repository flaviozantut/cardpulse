// @vitest-environment jsdom
/**
 * Tests for offline-cache — IndexedDB-backed storage for decrypted data.
 */

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  saveTransactions,
  loadTransactions,
  saveCards,
  loadCards,
  clearOfflineCache,
} from "./offline-cache";
import type { DecryptedTransaction } from "../types/dashboard";
import type { DecryptedCard } from "../types/dashboard";

function makeTx(overrides: Partial<DecryptedTransaction> = {}): DecryptedTransaction {
  return {
    id: "tx-1",
    card_id: "card-1",
    timestamp_bucket: "2026-03",
    created_at: "2026-03-15T10:00:00Z",
    merchant: "Test Store",
    amount: 99.9,
    category: "groceries",
    description: "Test Store R$ 99,90",
    ...overrides,
  };
}

function makeCard(overrides: Partial<DecryptedCard> = {}): DecryptedCard {
  return {
    id: "card-1",
    created_at: "2026-01-01T00:00:00Z",
    label: "My Card",
    last_digits: "1234",
    brand: "Visa",
    ...overrides,
  };
}

describe("offline-cache", () => {
  beforeEach(async () => {
    await clearOfflineCache();
  });

  describe("saveTransactions / loadTransactions", () => {
    it("saves and loads transactions for a bucket", async () => {
      const txs = [makeTx({ id: "tx-1" }), makeTx({ id: "tx-2" })];

      await saveTransactions("2026-03", txs);
      const loaded = await loadTransactions("2026-03");

      expect(loaded).toHaveLength(2);
      expect(loaded[0].id).toBe("tx-1");
      expect(loaded[1].id).toBe("tx-2");
    });

    it("returns empty array for unknown bucket", async () => {
      const loaded = await loadTransactions("2025-01");
      expect(loaded).toEqual([]);
    });

    it("overwrites existing cache for same bucket", async () => {
      await saveTransactions("2026-03", [makeTx({ id: "old" })]);
      await saveTransactions("2026-03", [makeTx({ id: "new" })]);

      const loaded = await loadTransactions("2026-03");
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe("new");
    });

    it("stores transactions for different buckets independently", async () => {
      await saveTransactions("2026-02", [makeTx({ id: "feb" })]);
      await saveTransactions("2026-03", [makeTx({ id: "mar" })]);

      expect((await loadTransactions("2026-02"))[0].id).toBe("feb");
      expect((await loadTransactions("2026-03"))[0].id).toBe("mar");
    });
  });

  describe("saveCards / loadCards", () => {
    it("saves and loads cards", async () => {
      const cards = [makeCard({ id: "c-1" }), makeCard({ id: "c-2" })];

      await saveCards(cards);
      const loaded = await loadCards();

      expect(loaded).toHaveLength(2);
      expect(loaded[0].id).toBe("c-1");
      expect(loaded[1].id).toBe("c-2");
    });

    it("returns empty array when no cards are cached", async () => {
      const loaded = await loadCards();
      expect(loaded).toEqual([]);
    });

    it("overwrites existing cards", async () => {
      await saveCards([makeCard({ id: "old" })]);
      await saveCards([makeCard({ id: "new" })]);

      const loaded = await loadCards();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe("new");
    });
  });

  describe("clearOfflineCache", () => {
    it("removes all cached data", async () => {
      await saveTransactions("2026-03", [makeTx()]);
      await saveCards([makeCard()]);

      await clearOfflineCache();

      expect(await loadTransactions("2026-03")).toEqual([]);
      expect(await loadCards()).toEqual([]);
    });
  });
});
