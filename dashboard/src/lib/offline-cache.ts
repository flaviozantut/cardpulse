/**
 * Offline cache for decrypted data using IndexedDB.
 *
 * Stores plaintext transaction and card data client-side after decryption,
 * enabling offline viewing. Data is scoped to the origin and protected by
 * the browser's same-origin policy.
 *
 * All data is cleared on explicit logout via `clearOfflineCache`.
 */

import type { DecryptedTransaction, DecryptedCard } from "../types/dashboard";

const DB_NAME = "cardpulse-offline";
const DB_VERSION = 1;
const STORE_TRANSACTIONS = "transactions";
const STORE_CARDS = "cards";

/** Opens (or upgrades) the IndexedDB database. */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_TRANSACTIONS)) {
        // Keyed by timestamp_bucket ("YYYY-MM") — each bucket is one record
        db.createObjectStore(STORE_TRANSACTIONS, { keyPath: "bucket" });
      }
      if (!db.objectStoreNames.contains(STORE_CARDS)) {
        // Single record keyed by a fixed key
        db.createObjectStore(STORE_CARDS, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves decrypted transactions for a month bucket to IndexedDB.
 *
 * Overwrites any existing cached data for the same bucket.
 *
 * @param bucket - Month in "YYYY-MM" format
 * @param transactions - Decrypted transactions to cache
 */
export async function saveTransactions(
  bucket: string,
  transactions: DecryptedTransaction[],
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRANSACTIONS, "readwrite");
    const store = tx.objectStore(STORE_TRANSACTIONS);
    store.put({ bucket, transactions });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Loads cached decrypted transactions for a month bucket.
 *
 * Returns an empty array if no cached data exists for the bucket.
 *
 * @param bucket - Month in "YYYY-MM" format
 */
export async function loadTransactions(
  bucket: string,
): Promise<DecryptedTransaction[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRANSACTIONS, "readonly");
    const store = tx.objectStore(STORE_TRANSACTIONS);
    const request = store.get(bucket);
    request.onsuccess = () => {
      const record = request.result as { bucket: string; transactions: DecryptedTransaction[] } | undefined;
      resolve(record?.transactions ?? []);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves decrypted cards to IndexedDB.
 *
 * Overwrites any previously cached card list.
 *
 * @param cards - Decrypted cards to cache
 */
export async function saveCards(cards: DecryptedCard[]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CARDS, "readwrite");
    const store = tx.objectStore(STORE_CARDS);
    store.put({ key: "cards", cards });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Loads cached decrypted cards from IndexedDB.
 *
 * Returns an empty array if no cached data exists.
 */
export async function loadCards(): Promise<DecryptedCard[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CARDS, "readonly");
    const store = tx.objectStore(STORE_CARDS);
    const request = store.get("cards");
    request.onsuccess = () => {
      const record = request.result as { key: string; cards: DecryptedCard[] } | undefined;
      resolve(record?.cards ?? []);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clears all cached offline data.
 *
 * Should be called on logout to remove plaintext data from IndexedDB.
 */
export async function clearOfflineCache(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_TRANSACTIONS, STORE_CARDS], "readwrite");
    tx.objectStore(STORE_TRANSACTIONS).clear();
    tx.objectStore(STORE_CARDS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
