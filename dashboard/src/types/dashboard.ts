/**
 * Client-side types for decrypted data and UI state.
 *
 * These types represent data after client-side decryption —
 * they contain plaintext fields extracted from `encrypted_data`.
 */

/** A transaction after client-side decryption. */
export interface DecryptedTransaction {
  id: string;
  card_id: string;
  timestamp_bucket: string;
  created_at: string;
  merchant: string;
  amount: number;
  category: string;
  description: string;
}

/** A card after client-side decryption. */
export interface DecryptedCard {
  id: string;
  created_at: string;
  label: string;
  last_digits: string;
  brand: string;
}
