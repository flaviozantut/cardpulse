/**
 * Client-side cryptography module using Web Crypto API.
 *
 * Implements the zero-knowledge decryption flow:
 *   1. Derive an unwrap key from master password + salt via PBKDF2
 *   2. Unwrap (decrypt) the DEK using AES-256-GCM
 *   3. Decrypt card/transaction data using the DEK with AES-256-GCM
 *
 * No external dependencies — uses only the browser's native Web Crypto API.
 */

/** Default number of PBKDF2 iterations if not specified in dek_params. */
const DEFAULT_ITERATIONS = 600000;

/** AES-GCM initialization vector length in bytes. */
const IV_LENGTH = 12;

/** AES-GCM authentication tag length in bits. */
const TAG_LENGTH_BITS = 128;


/** Parameters for DEK derivation via PBKDF2. */
export interface DekParams {
  iterations?: number;
}

/** Custom error for cryptographic operation failures. */
export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoError";
  }
}

/**
 * Decodes a base64-encoded string into a Uint8Array.
 *
 * Uses the browser's native `atob` for decoding.
 */
export function base64ToBytes(base64: string): Uint8Array {
  if (base64 === "") return new Uint8Array(0);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encodes a Uint8Array into a base64 string.
 *
 * Uses the browser's native `btoa` for encoding.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Derives a CryptoKey from a master password and salt using PBKDF2-SHA256.
 *
 * The derived key is suitable for unwrapping (decrypting) the user's DEK.
 * Uses PBKDF2 because Web Crypto API does not support Argon2id.
 *
 * @param password - The user's master password
 * @param saltBase64 - Base64-encoded salt (from server's dek_salt)
 * @param params - Derivation parameters (iterations count)
 * @returns A non-extractable CryptoKey for AES-256-GCM decryption
 */
export async function deriveKey(
  password: string,
  saltBase64: string,
  params: DekParams
): Promise<CryptoKey> {
  const salt = base64ToBytes(saltBase64);
  const iterations = params.iterations ?? DEFAULT_ITERATIONS;

  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

/**
 * Unwraps (decrypts) the Data Encryption Key using a derived key.
 *
 * The wrapped DEK format is: [12-byte IV] + [ciphertext + 16-byte auth tag].
 * This matches the format produced by the iOS Scriptable client.
 *
 * @param wrappedDekBase64 - Base64-encoded wrapped DEK from the server
 * @param derivedKey - CryptoKey derived from master password via `deriveKey()`
 * @returns The raw DEK as a Uint8Array (32 bytes for AES-256)
 *
 * @throws {CryptoError} If the wrapped DEK is too short or decryption fails
 *   (wrong password produces a decryption failure)
 */
export async function unwrapDek(
  wrappedDekBase64: string,
  derivedKey: CryptoKey
): Promise<Uint8Array> {
  const wrappedBytes = base64ToBytes(wrappedDekBase64);

  if (wrappedBytes.length <= IV_LENGTH) {
    throw new CryptoError(
      "Decryption failed: wrapped DEK is too short"
    );
  }

  const iv = wrappedBytes.slice(0, IV_LENGTH);
  const ciphertext = wrappedBytes.slice(IV_LENGTH);

  try {
    const dekBytes = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer, tagLength: TAG_LENGTH_BITS },
      derivedKey,
      ciphertext.buffer as ArrayBuffer
    );

    return new Uint8Array(dekBytes);
  } catch {
    throw new CryptoError(
      "Decryption failed: wrong password or corrupted data"
    );
  }
}

/**
 * Decrypts AES-256-GCM encrypted data using the DEK.
 *
 * The encrypted data format matches the CardPulse convention:
 * - `ciphertext`: the encrypted content (without auth tag)
 * - `iv`: 12-byte initialization vector
 * - `authTag`: 16-byte authentication tag
 *
 * All inputs are base64-encoded. The ciphertext and auth tag are
 * concatenated before decryption, as Web Crypto API expects them together.
 *
 * @param ciphertextBase64 - Base64-encoded ciphertext (without auth tag)
 * @param ivBase64 - Base64-encoded 12-byte IV
 * @param authTagBase64 - Base64-encoded 16-byte auth tag
 * @param dek - Raw DEK as Uint8Array (32 bytes)
 * @returns Decrypted plaintext as a UTF-8 string
 *
 * @throws {CryptoError} If decryption fails (wrong key, tampered data, etc.)
 */
export async function decrypt(
  ciphertextBase64: string,
  ivBase64: string,
  authTagBase64: string,
  dek: Uint8Array
): Promise<string> {
  const ciphertext = base64ToBytes(ciphertextBase64);
  const iv = base64ToBytes(ivBase64);
  const authTag = base64ToBytes(authTagBase64);

  // Web Crypto expects ciphertext + authTag concatenated
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext, 0);
  combined.set(authTag, ciphertext.length);

  const key = await crypto.subtle.importKey(
    "raw",
    dek.buffer as ArrayBuffer,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer, tagLength: TAG_LENGTH_BITS },
      key,
      combined.buffer as ArrayBuffer
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    throw new CryptoError(
      "Decryption failed: wrong key or tampered data"
    );
  }
}
