/**
 * Transaction data utilities for client-side encryption and decryption.
 *
 * Handles converting between encrypted API transaction data and
 * the plaintext DecryptedTransaction type used in the UI.
 */

import { decrypt, encrypt } from "./crypto";
import type { EncryptResult } from "./crypto";
import type { Transaction } from "../types/api";
import type { CategorySource, DecryptedTransaction } from "../types/dashboard";
import { autoCategory } from "./categoryRules";
import { lookupOverride } from "./overrides";
import type { CategoryOverrides } from "./overrides";
import { fuzzyMatchCategory } from "./fuzzyCategory";

/** Input data for creating an encrypted transaction. */
export interface TransactionFormData {
  merchant: string;
  amount: number;
  category: string;
}

/**
 * Decrypts a single transaction's encrypted_data and extracts structured fields.
 *
 * Category resolution order (highest priority first):
 * 1. Explicit manual category stored in the payload (no source tag)
 * 2. Learned override from the merchant→category map (`auto_learned`)
 * 3. Fuzzy match against override keys for name variations (`auto_fuzzy`)
 * 4. Keyword dictionary match (`auto_keyword`)
 * 5. Falls back to `"uncategorized"` (no source tag)
 *
 * Tries to parse decrypted plaintext as JSON first (structured iOS data).
 * Falls back to plain-text parsing with R$ amount extraction.
 * Returns a safe fallback on decryption failure.
 *
 * @param tx - Encrypted transaction from the API
 * @param dek - Raw DEK bytes for decryption
 * @param overrides - Optional merchant→category override map (from `/v1/config/category_overrides`)
 */
export async function decryptTransaction(
  tx: Transaction,
  dek: Uint8Array,
  overrides: CategoryOverrides = {},
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
      const merchant: string = parsed.merchant ?? parsed.name ?? plaintext;
      const rawCategory: string = parsed.category ?? "uncategorized";

      let category: string;
      let category_source: CategorySource | undefined;

      if (rawCategory !== "uncategorized") {
        // Explicit category in payload — treat as manual (no source badge)
        category = rawCategory;
      } else {
        // Check learned overrides first (highest priority among auto sources)
        const overrideMatch = lookupOverride(overrides, merchant);
        if (overrideMatch) {
          category = overrideMatch;
          category_source = "auto_learned";
        } else {
          // Fuzzy match against override keys for name variations
          const fuzzyMatch = fuzzyMatchCategory(merchant, overrides);
          if (fuzzyMatch) {
            category = fuzzyMatch;
            category_source = "auto_fuzzy";
          } else {
            // Fall back to keyword dictionary
            const keywordMatch = autoCategory(merchant);
            if (keywordMatch) {
              category = keywordMatch;
              category_source = "auto_keyword";
            } else {
              category = "uncategorized";
            }
          }
        }
      }

      return {
        id: tx.id,
        card_id: tx.card_id,
        timestamp_bucket: tx.timestamp_bucket,
        created_at: tx.created_at,
        merchant,
        amount: parsed.amount ?? 0,
        category,
        category_source,
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
