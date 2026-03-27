/**
 * Category management utilities for transactions.
 *
 * Handles updating categories in encrypted transaction payloads,
 * re-encrypting client-side before sending to the API.
 */

import { encrypt } from "./crypto";
import type { EncryptResult } from "./crypto";
import type { DecryptedTransaction } from "../types/dashboard";

/**
 * Extracts unique, sorted category names from a list of transactions.
 *
 * Excludes "uncategorized" since it represents the default/unset state
 * and should not appear as a suggestion.
 */
export function extractUniqueCategories(
  transactions: DecryptedTransaction[],
): string[] {
  const categories = new Set<string>();

  for (const tx of transactions) {
    if (tx.category && tx.category !== "uncategorized") {
      categories.add(tx.category);
    }
  }

  return Array.from(categories).sort();
}

/**
 * Updates the category field in a transaction payload string.
 *
 * If the payload is valid JSON, merges the new category into it.
 * If it's a plain-text string, wraps it in a JSON object with
 * the original text as `description` and the new category.
 */
export function updateCategoryInPayload(
  originalPlaintext: string,
  newCategory: string,
): string {
  try {
    const parsed = JSON.parse(originalPlaintext);
    parsed.category = newCategory;
    return JSON.stringify(parsed);
  } catch {
    // Non-JSON plaintext — wrap in structured object
    return JSON.stringify({
      description: originalPlaintext,
      category: newCategory,
    });
  }
}

/**
 * Builds an encrypted payload with an updated category.
 *
 * Takes the original decrypted plaintext, updates the category,
 * and re-encrypts using the DEK. Returns base64-encoded fields
 * ready for the PUT /v1/transactions/:id API call.
 */
export async function buildCategoryPayload(
  originalPlaintext: string,
  newCategory: string,
  dek: Uint8Array,
): Promise<EncryptResult> {
  const updatedPayload = updateCategoryInPayload(
    originalPlaintext,
    newCategory,
  );
  return encrypt(updatedPayload, dek);
}
