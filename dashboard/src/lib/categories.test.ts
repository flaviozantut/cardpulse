import { describe, it, expect } from "vitest";
import { decrypt } from "./crypto";
import {
  buildCategoryPayload,
  extractUniqueCategories,
  updateCategoryInPayload,
} from "./categories";
import type { DecryptedTransaction } from "../types/dashboard";

describe("extractUniqueCategories", () => {
  it("returns unique sorted categories from transactions", () => {
    const txs: DecryptedTransaction[] = [
      makeTx({ category: "food" }),
      makeTx({ category: "transport" }),
      makeTx({ category: "food" }),
      makeTx({ category: "entertainment" }),
    ];

    const result = extractUniqueCategories(txs);

    expect(result).toEqual(["entertainment", "food", "transport"]);
  });

  it("returns empty array for empty transactions", () => {
    expect(extractUniqueCategories([])).toEqual([]);
  });

  it("excludes uncategorized from suggestions", () => {
    const txs: DecryptedTransaction[] = [
      makeTx({ category: "uncategorized" }),
      makeTx({ category: "food" }),
    ];

    const result = extractUniqueCategories(txs);

    expect(result).toEqual(["food"]);
  });
});

describe("updateCategoryInPayload", () => {
  it("updates category in a JSON payload string", () => {
    const original = JSON.stringify({
      merchant: "Shell",
      amount: 150,
      category: "uncategorized",
    });

    const updated = updateCategoryInPayload(original, "transport");
    const parsed = JSON.parse(updated);

    expect(parsed.category).toBe("transport");
    expect(parsed.merchant).toBe("Shell");
    expect(parsed.amount).toBe(150);
  });

  it("adds category field when not present in JSON", () => {
    const original = JSON.stringify({
      merchant: "Padaria",
      amount: 8.5,
    });

    const updated = updateCategoryInPayload(original, "food");
    const parsed = JSON.parse(updated);

    expect(parsed.category).toBe("food");
    expect(parsed.merchant).toBe("Padaria");
  });

  it("handles non-JSON plaintext by wrapping in JSON with category", () => {
    const original = "Mercado Extra R$ 35,94";

    const updated = updateCategoryInPayload(original, "groceries");
    const parsed = JSON.parse(updated);

    expect(parsed.category).toBe("groceries");
    expect(parsed.description).toBe("Mercado Extra R$ 35,94");
  });
});

describe("buildCategoryPayload", () => {
  it("encrypts updated payload and returns API-ready fields", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const originalPlaintext = JSON.stringify({
      merchant: "Shell",
      amount: 150,
      category: "uncategorized",
    });

    const result = await buildCategoryPayload(
      originalPlaintext,
      "transport",
      dek,
    );

    expect(result.encrypted_data).toBeTruthy();
    expect(result.iv).toBeTruthy();
    expect(result.auth_tag).toBeTruthy();

    // Verify the encrypted payload decrypts to updated data
    const decrypted = await decrypt(
      result.encrypted_data,
      result.iv,
      result.auth_tag,
      dek,
    );
    const parsed = JSON.parse(decrypted);
    expect(parsed.category).toBe("transport");
    expect(parsed.merchant).toBe("Shell");
  });

  it("roundtrips correctly for non-JSON payloads", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const originalPlaintext = "Padaria R$ 8,50";

    const result = await buildCategoryPayload(
      originalPlaintext,
      "food",
      dek,
    );

    const decrypted = await decrypt(
      result.encrypted_data,
      result.iv,
      result.auth_tag,
      dek,
    );
    const parsed = JSON.parse(decrypted);
    expect(parsed.category).toBe("food");
    expect(parsed.description).toBe("Padaria R$ 8,50");
  });
});

/** Helper to create a minimal DecryptedTransaction. */
function makeTx(
  overrides: Partial<DecryptedTransaction>,
): DecryptedTransaction {
  return {
    id: "tx-1",
    card_id: "card-1",
    timestamp_bucket: "2026-03",
    created_at: "2026-03-15T10:00:00Z",
    merchant: "Test Merchant",
    amount: 10,
    category: "uncategorized",
    description: "test",
    ...overrides,
  };
}
