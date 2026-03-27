/**
 * Integration tests for the category update workflow.
 *
 * Validates the full flow: decrypt → update category → re-encrypt → decrypt again,
 * ensuring the category is persisted correctly through the crypto roundtrip.
 */

import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./crypto";
import {
  buildCategoryPayload,
  updateCategoryInPayload,
  extractUniqueCategories,
} from "./categories";
import type { DecryptedTransaction } from "../types/dashboard";

describe("category update workflow", () => {
  it("roundtrips: encrypt → decrypt → update category → re-encrypt → decrypt", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const originalData = {
      merchant: "Mercado Livre",
      amount: 245.9,
      category: "uncategorized",
    };

    // Step 1: encrypt original data
    const encrypted = await encrypt(JSON.stringify(originalData), dek);

    // Step 2: decrypt it (simulating what DashboardPage does)
    const decrypted = await decrypt(
      encrypted.encrypted_data,
      encrypted.iv,
      encrypted.auth_tag,
      dek,
    );
    expect(JSON.parse(decrypted).category).toBe("uncategorized");

    // Step 3: update category and re-encrypt
    const updated = await buildCategoryPayload(decrypted, "shopping", dek);

    // Step 4: decrypt the re-encrypted data
    const finalDecrypted = await decrypt(
      updated.encrypted_data,
      updated.iv,
      updated.auth_tag,
      dek,
    );
    const parsed = JSON.parse(finalDecrypted);

    expect(parsed.category).toBe("shopping");
    expect(parsed.merchant).toBe("Mercado Livre");
    expect(parsed.amount).toBe(245.9);
  });

  it("preserves all original fields when updating category", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const originalData = {
      merchant: "Shell",
      amount: 150,
      category: "uncategorized",
      description: "Fuel",
      extra_field: "should be preserved",
    };

    const encrypted = await encrypt(JSON.stringify(originalData), dek);
    const decrypted = await decrypt(
      encrypted.encrypted_data,
      encrypted.iv,
      encrypted.auth_tag,
      dek,
    );

    const updated = await buildCategoryPayload(decrypted, "transport", dek);
    const finalDecrypted = await decrypt(
      updated.encrypted_data,
      updated.iv,
      updated.auth_tag,
      dek,
    );
    const parsed = JSON.parse(finalDecrypted);

    expect(parsed.category).toBe("transport");
    expect(parsed.merchant).toBe("Shell");
    expect(parsed.amount).toBe(150);
    expect(parsed.description).toBe("Fuel");
    expect(parsed.extra_field).toBe("should be preserved");
  });

  it("handles updating category multiple times", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const originalData = {
      merchant: "Netflix",
      amount: 55.9,
      category: "uncategorized",
    };

    // First update
    const enc1 = await encrypt(JSON.stringify(originalData), dek);
    const dec1 = await decrypt(
      enc1.encrypted_data,
      enc1.iv,
      enc1.auth_tag,
      dek,
    );
    const updated1 = await buildCategoryPayload(dec1, "entertainment", dek);

    // Second update (change again)
    const dec2 = await decrypt(
      updated1.encrypted_data,
      updated1.iv,
      updated1.auth_tag,
      dek,
    );
    const updated2 = await buildCategoryPayload(dec2, "subscriptions", dek);

    const finalDecrypted = await decrypt(
      updated2.encrypted_data,
      updated2.iv,
      updated2.auth_tag,
      dek,
    );
    const parsed = JSON.parse(finalDecrypted);

    expect(parsed.category).toBe("subscriptions");
    expect(parsed.merchant).toBe("Netflix");
    expect(parsed.amount).toBe(55.9);
  });

  it("category suggestions update as transactions are categorized", () => {
    const txs: DecryptedTransaction[] = [
      makeTx({ id: "1", category: "uncategorized" }),
      makeTx({ id: "2", category: "food" }),
      makeTx({ id: "3", category: "uncategorized" }),
    ];

    // Initially only "food" is a suggestion
    expect(extractUniqueCategories(txs)).toEqual(["food"]);

    // Simulate categorizing tx1 as "transport"
    txs[0] = { ...txs[0], category: "transport" };

    expect(extractUniqueCategories(txs)).toEqual(["food", "transport"]);
  });
});

describe("updateCategoryInPayload edge cases", () => {
  it("handles empty string category (clearing a category)", () => {
    const original = JSON.stringify({
      merchant: "Test",
      category: "food",
    });

    const updated = updateCategoryInPayload(original, "");
    const parsed = JSON.parse(updated);

    expect(parsed.category).toBe("");
  });

  it("handles category with special characters", () => {
    const original = JSON.stringify({
      merchant: "Test",
      category: "uncategorized",
    });

    const updated = updateCategoryInPayload(
      original,
      "alimentação & bebidas",
    );
    const parsed = JSON.parse(updated);

    expect(parsed.category).toBe("alimentação & bebidas");
  });

  it("handles deeply nested JSON gracefully", () => {
    const original = JSON.stringify({
      merchant: "Test",
      nested: { deep: { value: 1 } },
      category: "old",
    });

    const updated = updateCategoryInPayload(original, "new");
    const parsed = JSON.parse(updated);

    expect(parsed.category).toBe("new");
    expect(parsed.nested.deep.value).toBe(1);
  });
});

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
