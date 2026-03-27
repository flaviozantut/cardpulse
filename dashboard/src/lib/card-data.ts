/**
 * Card data utilities for client-side encryption and decryption.
 *
 * Handles converting between encrypted API card data and
 * the plaintext DecryptedCard type used in the UI.
 */

import { decrypt, encrypt } from "./crypto";
import type { Card } from "../types/api";
import type { DecryptedCard } from "../types/dashboard";
import type { EncryptResult } from "./crypto";

/** Input data for creating an encrypted card. */
export interface CardFormData {
  label: string;
  last_digits: string;
  brand: string;
}

/**
 * Decrypts a single card's encrypted_data and extracts structured fields.
 *
 * Tries to parse the decrypted plaintext as JSON first. If it's not JSON,
 * uses the raw plaintext as the label with empty last_digits and brand.
 *
 * @param card - Encrypted card from the API
 * @param dek - Raw DEK as Uint8Array (32 bytes)
 * @returns Decrypted card with label, last_digits, and brand
 */
export async function decryptCard(
  card: Card,
  dek: Uint8Array
): Promise<DecryptedCard> {
  try {
    const plaintext = await decrypt(card.encrypted_data, card.iv, card.auth_tag, dek);

    try {
      const parsed = JSON.parse(plaintext);
      return {
        id: card.id,
        created_at: card.created_at,
        label: parsed.label ?? plaintext,
        last_digits: parsed.last_digits ?? "",
        brand: parsed.brand ?? "",
      };
    } catch {
      // Not JSON — use raw plaintext as label
      return {
        id: card.id,
        created_at: card.created_at,
        label: plaintext,
        last_digits: "",
        brand: "",
      };
    }
  } catch {
    return {
      id: card.id,
      created_at: card.created_at,
      label: "[Decryption failed]",
      last_digits: "",
      brand: "",
    };
  }
}

/**
 * Encrypts card form data into the format expected by the API.
 *
 * Serializes the card data as JSON and encrypts it with AES-256-GCM.
 *
 * @param data - Card form data (label, last_digits, brand)
 * @param dek - Raw DEK as Uint8Array (32 bytes)
 * @returns Encrypted fields ready for the API (encrypted_data, iv, auth_tag)
 */
export async function encryptCardData(
  data: CardFormData,
  dek: Uint8Array
): Promise<EncryptResult> {
  const plaintext = JSON.stringify({
    label: data.label,
    last_digits: data.last_digits,
    brand: data.brand,
  });

  return encrypt(plaintext, dek);
}

/**
 * Formats a card label for display, combining label and last digits.
 *
 * @example
 * formatCardLabel("Nubank", "4567") // "Nubank ••4567"
 * formatCardLabel("My Card", "")    // "My Card"
 */
export function formatCardLabel(label: string, lastDigits: string): string {
  if (label && lastDigits) return `${label} ••${lastDigits}`;
  if (label) return label;
  if (lastDigits) return `••${lastDigits}`;
  return "Unknown card";
}
