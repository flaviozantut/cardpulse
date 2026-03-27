/**
 * Tests for transaction data utilities — encryption, decryption, formatting.
 */

import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./crypto";
import {
  decryptTransaction,
  encryptTransactionData,
  currentTimestampBucket,
} from "./transaction-data";
import type { Transaction } from "../types/api";

/** Helper to create an encrypted transaction fixture. */
async function createEncryptedTx(
  dek: Uint8Array,
  data: Record<string, unknown>,
  overrides?: Partial<Transaction>,
): Promise<Transaction> {
  const { encrypted_data, iv, auth_tag } = await encrypt(
    JSON.stringify(data),
    dek,
  );
  return {
    id: overrides?.id ?? "tx-uuid-1",
    user_id: overrides?.user_id ?? "user-uuid-1",
    card_id: overrides?.card_id ?? "card-uuid-1",
    encrypted_data,
    iv,
    auth_tag,
    timestamp_bucket: overrides?.timestamp_bucket ?? "2026-03",
    created_at: overrides?.created_at ?? "2026-03-15T10:30:00Z",
  };
}

describe("decryptTransaction", () => {
  it("decrypts a transaction with valid JSON encrypted data", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const txData = {
      merchant: "Shell",
      amount: 150.5,
      category: "transport",
    };
    const encrypted = await createEncryptedTx(dek, txData);

    const result = await decryptTransaction(encrypted, dek);

    expect(result.id).toBe("tx-uuid-1");
    expect(result.card_id).toBe("card-uuid-1");
    expect(result.merchant).toBe("Shell");
    expect(result.amount).toBe(150.5);
    expect(result.category).toBe("transport");
    expect(result.timestamp_bucket).toBe("2026-03");
  });

  it("handles JSON with name field instead of merchant", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const txData = { name: "Padaria", amount: 8.5 };
    const encrypted = await createEncryptedTx(dek, txData);

    const result = await decryptTransaction(encrypted, dek);

    expect(result.merchant).toBe("Padaria");
  });

  it("defaults category to uncategorized when missing", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const txData = { merchant: "Test", amount: 10 };
    const encrypted = await createEncryptedTx(dek, txData);

    const result = await decryptTransaction(encrypted, dek);

    expect(result.category).toBe("uncategorized");
  });

  it("handles non-JSON plaintext with R$ amount", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const { encrypted_data, iv, auth_tag } = await encrypt(
      "Mercado Extra R$ 35,94",
      dek,
    );
    const tx: Transaction = {
      id: "tx-2",
      user_id: "u-1",
      card_id: "c-1",
      encrypted_data,
      iv,
      auth_tag,
      timestamp_bucket: "2026-03",
      created_at: "2026-03-20T08:00:00Z",
    };

    const result = await decryptTransaction(tx, dek);

    expect(result.merchant).toBe("Mercado Extra");
    expect(result.amount).toBe(35.94);
    expect(result.category).toBe("uncategorized");
  });

  it("returns fallback on decryption failure", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const wrongDek = crypto.getRandomValues(new Uint8Array(32));
    const encrypted = await createEncryptedTx(dek, {
      merchant: "Secret",
      amount: 100,
    });

    const result = await decryptTransaction(encrypted, wrongDek);

    expect(result.merchant).toBe("[Decryption failed]");
    expect(result.amount).toBe(0);
    expect(result.category).toBe("unknown");
  });
});

describe("encryptTransactionData", () => {
  it("encrypts form data and returns API-ready fields", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const formData = {
      merchant: "Shell",
      amount: 150.5,
      category: "transport",
    };

    const result = await encryptTransactionData(formData, dek);

    expect(result.encrypted_data).toBeTruthy();
    expect(result.iv).toBeTruthy();
    expect(result.auth_tag).toBeTruthy();

    // Verify roundtrip
    const decrypted = await decrypt(
      result.encrypted_data,
      result.iv,
      result.auth_tag,
      dek,
    );
    const parsed = JSON.parse(decrypted);
    expect(parsed.merchant).toBe("Shell");
    expect(parsed.amount).toBe(150.5);
    expect(parsed.category).toBe("transport");
  });

  it("handles empty category by defaulting to uncategorized", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const formData = { merchant: "Test", amount: 10, category: "" };

    const result = await encryptTransactionData(formData, dek);

    const decrypted = await decrypt(
      result.encrypted_data,
      result.iv,
      result.auth_tag,
      dek,
    );
    const parsed = JSON.parse(decrypted);
    expect(parsed.category).toBe("uncategorized");
  });

  it("handles special characters in merchant name", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const formData = {
      merchant: 'Padaria São João "Delícias"',
      amount: 8.5,
      category: "food",
    };

    const result = await encryptTransactionData(formData, dek);

    const decrypted = await decrypt(
      result.encrypted_data,
      result.iv,
      result.auth_tag,
      dek,
    );
    const parsed = JSON.parse(decrypted);
    expect(parsed.merchant).toBe('Padaria São João "Delícias"');
  });
});

describe("currentTimestampBucket", () => {
  it("returns current date in YYYY-MM format", () => {
    const bucket = currentTimestampBucket();

    expect(bucket).toMatch(/^\d{4}-\d{2}$/);

    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    expect(bucket).toBe(expected);
  });
});
