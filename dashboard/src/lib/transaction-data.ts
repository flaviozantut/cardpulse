/**
 * Transaction data utilities for client-side encryption and decryption.
 *
 * Handles converting between encrypted API transaction data and
 * the plaintext DecryptedTransaction type used in the UI.
 */

import { decrypt, encrypt } from "./crypto";
import type { EncryptResult } from "./crypto";
import type { Transaction } from "../types/api";
import type { DecryptedTransaction } from "../types/dashboard";

/** Input data for creating an encrypted transaction. */
export interface TransactionFormData {
  merchant: string;
  amount: number;
  category: string;
}

/**
 * Decrypts a single transaction's encrypted_data and extracts structured fields.
 *
 * Tries to parse decrypted plaintext as JSON first (structured iOS data).
 * Falls back to plain-text parsing with R$ amount extraction.
 * Returns a safe fallback on decryption failure.
 */
export async function decryptTransaction(
  tx: Transaction,
  dek: Uint8Array,
): Promise<DecryptedTransaction> {
  try {
    const plaintext = await decrypt(
      tx.encrypted_data,
      tx.iv,
      tx.auth_tag,
      dek,
    );

    try {
      const parsed = JSON.parse(plaintext);
      return {
        id: tx.id,
        card_id: tx.card_id,
        timestamp_bucket: tx.timestamp_bucket,
        created_at: tx.created_at,
        merchant: parsed.merchant ?? parsed.name ?? plaintext,
        amount: parsed.amount ?? 0,
        category: parsed.category ?? "uncategorized",
        description: plaintext,
      };
    } catch {
      // Not JSON — extract amount from R$ pattern
      const amountMatch = plaintext.match(/R\$\s*([\d.,]+)/);
      const amount = amountMatch
        ? parseFloat(amountMatch[1].replace(".", "").replace(",", "."))
        : 0;

      return {
        id: tx.id,
        card_id: tx.card_id,
        timestamp_bucket: tx.timestamp_bucket,
        created_at: tx.created_at,
        merchant: plaintext.replace(/R\$\s*[\d.,]+/, "").trim() || plaintext,
        amount,
        category: "uncategorized",
        description: plaintext,
      };
    }
  } catch {
    return {
      id: tx.id,
      card_id: tx.card_id,
      timestamp_bucket: tx.timestamp_bucket,
      created_at: tx.created_at,
      merchant: "[Decryption failed]",
      amount: 0,
      category: "unknown",
      description: "[Unable to decrypt]",
    };
  }
}

/**
 * Encrypts transaction form data into the format expected by the API.
 *
 * Serializes the transaction data as JSON and encrypts with AES-256-GCM.
 */
export async function encryptTransactionData(
  data: TransactionFormData,
  dek: Uint8Array,
): Promise<EncryptResult> {
  const plaintext = JSON.stringify({
    merchant: data.merchant,
    amount: data.amount,
    category: data.category || "uncategorized",
  });

  return encrypt(plaintext, dek);
}

/**
 * Returns the current date as a YYYY-MM timestamp bucket string.
 *
 * @example
 * currentTimestampBucket() // "2026-03"
 */
export function currentTimestampBucket(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
