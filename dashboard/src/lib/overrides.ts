/**
 * Category override management for learned merchant→category mappings.
 *
 * Overrides are stored as an encrypted JSON blob on the server under the
 * config type "category_overrides". The plaintext format is a flat object:
 * `{ "MERCHANT NAME": "Category", ... }` — keys are normalized to uppercase.
 *
 * Override lookup always takes priority over keyword dictionary matching.
 * When an override matches, the transaction is tagged with
 * `category_source: "auto_learned"`.
 */

import { encrypt, decrypt } from "./crypto";
import { getConfig, putConfig } from "./api";
import { ApiClientError } from "./api";

/** The config type key used to store category overrides on the server. */
const CONFIG_TYPE = "category_overrides";

/**
 * Merchant→category override map.
 *
 * Keys are uppercase merchant names for case-insensitive matching.
 */
export type CategoryOverrides = Record<string, string>;

/**
 * Fetches and decrypts the category overrides config blob from the server.
 *
 * Returns an empty map if no overrides have been saved yet.
 *
 * @param token - JWT access token
 * @param dek - Raw DEK bytes for decryption
 */
export async function fetchOverrides(
  token: string,
  dek: Uint8Array,
): Promise<CategoryOverrides> {
  try {
    const config = await getConfig(token, CONFIG_TYPE);
    const plaintext = await decrypt(
      config.encrypted_data,
      config.iv,
      config.auth_tag,
      dek,
    );
    return JSON.parse(plaintext) as CategoryOverrides;
  } catch (err) {
    // 404 means no overrides saved yet — return empty map
    if (err instanceof ApiClientError && err.status === 404) {
      return {};
    }
    // Re-throw unexpected errors
    throw err;
  }
}

/**
 * Encrypts and saves the category overrides config blob to the server.
 *
 * @param token - JWT access token
 * @param dek - Raw DEK bytes for encryption
 * @param overrides - The full override map to save
 */
export async function saveOverrides(
  token: string,
  dek: Uint8Array,
  overrides: CategoryOverrides,
): Promise<void> {
  const plaintext = JSON.stringify(overrides);
  const encrypted = await encrypt(plaintext, dek);
  await putConfig(token, CONFIG_TYPE, {
    encrypted_data: encrypted.encrypted_data,
    iv: encrypted.iv,
    auth_tag: encrypted.auth_tag,
  });
}

/**
 * Returns a new override map with the given merchant→category mapping added.
 *
 * Normalizes the merchant key to uppercase for consistent matching.
 * Does not mutate the original map.
 *
 * @example
 * const updated = addOverride(overrides, "MERCADO EXTRA-1005", "Supermercado");
 */
export function addOverride(
  overrides: CategoryOverrides,
  merchant: string,
  category: string,
): CategoryOverrides {
  return { ...overrides, [merchant.toUpperCase()]: category };
}

/**
 * Looks up a merchant in the override map (case-insensitive).
 *
 * Returns the overridden category or null if no override exists.
 *
 * @example
 * lookupOverride(overrides, "ifood*restaurante") // "Delivery" if overridden
 */
export function lookupOverride(
  overrides: CategoryOverrides,
  merchant: string,
): string | null {
  return overrides[merchant.toUpperCase()] ?? null;
}
