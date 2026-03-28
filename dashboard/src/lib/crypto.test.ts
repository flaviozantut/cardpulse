import { describe, it, expect } from "vitest";
import {
  deriveKey,
  unwrapDek,
  wrapDek,
  generateDekSalt,
  decrypt,
  encrypt,
  base64ToBytes,
  bytesToBase64,
} from "./crypto";

// ═══════════════════════════════════════════════════════════════════════
// Test vectors generated with Web Crypto API — known-good values
// ═══════════════════════════════════════════════════════════════════════

// To generate these vectors, we use the same crypto flow as the iOS client:
//   1. PBKDF2(password, salt, iterations) → unwrap key
//   2. AES-GCM-encrypt(DEK, unwrap key, iv) → wrapped_dek
//   3. AES-GCM-encrypt(plaintext, DEK, iv) → encrypted_data + auth_tag

describe("base64ToBytes", () => {
  it("decodes a valid base64 string to Uint8Array", () => {
    // "hello" in base64 is "aGVsbG8="
    const bytes = base64ToBytes("aGVsbG8=");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes)).toBe("hello");
  });

  it("handles empty base64 string", () => {
    const bytes = base64ToBytes("");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(0);
  });
});

describe("bytesToBase64", () => {
  it("encodes Uint8Array to base64 string", () => {
    const bytes = new TextEncoder().encode("hello");
    expect(bytesToBase64(bytes)).toBe("aGVsbG8=");
  });

  it("handles empty Uint8Array", () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe("");
  });
});

describe("deriveKey", () => {
  it("derives a CryptoKey from password, salt, and params", async () => {
    const password = "test-password-123";
    const salt = bytesToBase64(new TextEncoder().encode("test-salt-value!"));
    const params = { iterations: 1000 };

    const key = await deriveKey(password, salt, params);

    expect(key).toBeInstanceOf(CryptoKey);
    expect(key.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
    expect(key.usages).toContain("decrypt");
    // Key should not be extractable for security
    expect(key.extractable).toBe(false);
  });

  it("produces deterministic output for same inputs", async () => {
    const password = "deterministic-test";
    const salt = bytesToBase64(new TextEncoder().encode("same-salt-1234!!"));
    const params = { iterations: 1000 };

    // Derive two keys independently — they should be equivalent
    await deriveKey(password, salt, params);
    const key2 = await deriveKey(password, salt, params);

    // Since keys aren't extractable, we verify by encrypting
    // and then decrypting with the independently derived key
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode("test data");

    // Derive an encrypt-capable key for this test
    const encryptKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: base64ToBytes(salt).buffer as ArrayBuffer,
        iterations: 1000,
        hash: "SHA-256",
      },
      await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
      ),
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      encryptKey,
      data
    );

    // Decrypt with key2 (derived independently)
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      key2,
      encrypted
    );

    expect(new TextDecoder().decode(decrypted)).toBe("test data");
  });

  it("uses default iterations when not specified", async () => {
    const password = "test-password";
    const salt = bytesToBase64(new TextEncoder().encode("salt-for-default"));
    const params = {};

    const key = await deriveKey(password, salt, params);
    expect(key).toBeInstanceOf(CryptoKey);
  });

  it("produces different keys for different passwords", async () => {
    const salt = bytesToBase64(new TextEncoder().encode("shared-salt-val!"));
    const params = { iterations: 1000 };

    const key2 = await deriveKey("password-two", salt, params);

    // Encrypt with password-one, try to decrypt with key2 (password-two) — should fail
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode("secret");

    // Derive an encrypt-capable key for password-one
    const encKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: base64ToBytes(salt).buffer as ArrayBuffer,
        iterations: 1000,
        hash: "SHA-256",
      },
      await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode("password-one"),
        "PBKDF2",
        false,
        ["deriveKey"]
      ),
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      encKey,
      data
    );

    await expect(
      crypto.subtle.decrypt(
        { name: "AES-GCM", iv, tagLength: 128 },
        key2,
        encrypted
      )
    ).rejects.toThrow();
  });
});

describe("unwrapDek", () => {
  it("unwraps a DEK encrypted with AES-GCM", async () => {
    // Setup: create a DEK, wrap it, then unwrap
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const password = "unwrap-test-password";
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltB64 = bytesToBase64(salt);
    const params = { iterations: 1000 };

    // Derive the wrapping key
    const passwordKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    const wrapKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 1000,
        hash: "SHA-256",
      },
      passwordKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );

    // Wrap the DEK: IV (12) + ciphertext + tag
    const wrapIv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: wrapIv, tagLength: 128 },
      wrapKey,
      dek
    );

    // Build wrapped_dek = IV + encrypted
    const wrappedDek = new Uint8Array(12 + wrapped.byteLength);
    wrappedDek.set(wrapIv, 0);
    wrappedDek.set(new Uint8Array(wrapped), 12);
    const wrappedDekB64 = bytesToBase64(wrappedDek);

    // Act: derive key and unwrap
    const derivedKey = await deriveKey(password, saltB64, params);
    const unwrappedDek = await unwrapDek(wrappedDekB64, derivedKey);

    // Assert: unwrapped DEK matches original
    expect(unwrappedDek).toBeInstanceOf(Uint8Array);
    expect(unwrappedDek.length).toBe(32);
    expect(Array.from(unwrappedDek)).toEqual(Array.from(dek));
  });

  it("throws CryptoError on wrong password", async () => {
    // Wrap a DEK with one password
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltB64 = bytesToBase64(salt);

    const passwordKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("correct-password"),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    const wrapKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 1000,
        hash: "SHA-256",
      },
      passwordKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );

    const wrapIv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: wrapIv, tagLength: 128 },
      wrapKey,
      dek
    );

    const wrappedDek = new Uint8Array(12 + wrapped.byteLength);
    wrappedDek.set(wrapIv, 0);
    wrappedDek.set(new Uint8Array(wrapped), 12);
    const wrappedDekB64 = bytesToBase64(wrappedDek);

    // Try to unwrap with wrong password
    const wrongKey = await deriveKey("wrong-password", saltB64, {
      iterations: 1000,
    });

    await expect(unwrapDek(wrappedDekB64, wrongKey)).rejects.toThrow(
      /wrong password|decryption failed/i
    );
  });

  it("throws on malformed wrapped DEK (too short)", async () => {
    const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
    const key = await deriveKey("password", salt, { iterations: 1000 });

    // Only 10 bytes — shorter than required 12-byte IV
    const shortData = bytesToBase64(new Uint8Array(10));

    await expect(unwrapDek(shortData, key)).rejects.toThrow();
  });
});

describe("decrypt", () => {
  it("decrypts AES-256-GCM encrypted data", async () => {
    const plaintext = "Mercado Extra R$ 35,94";

    // Generate a DEK and encrypt the plaintext
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const importedKey = await crypto.subtle.importKey(
      "raw",
      dek,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      importedKey,
      new TextEncoder().encode(plaintext)
    );

    // Split into ciphertext + auth tag (last 16 bytes)
    const encBytes = new Uint8Array(encrypted);
    const ciphertext = encBytes.slice(0, encBytes.length - 16);
    const authTag = encBytes.slice(encBytes.length - 16);

    const ciphertextB64 = bytesToBase64(ciphertext);
    const ivB64 = bytesToBase64(iv);
    const authTagB64 = bytesToBase64(authTag);

    // Act
    const decrypted = await decrypt(ciphertextB64, ivB64, authTagB64, dek);

    // Assert
    expect(decrypted).toBe(plaintext);
  });

  it("decrypts UTF-8 content with special characters", async () => {
    const plaintext = "Padaria São João — R$ 12,50 ☕";

    const dek = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const importedKey = await crypto.subtle.importKey(
      "raw",
      dek,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      importedKey,
      new TextEncoder().encode(plaintext)
    );

    const encBytes = new Uint8Array(encrypted);
    const ciphertextB64 = bytesToBase64(encBytes.slice(0, encBytes.length - 16));
    const ivB64 = bytesToBase64(iv);
    const authTagB64 = bytesToBase64(encBytes.slice(encBytes.length - 16));

    const decrypted = await decrypt(ciphertextB64, ivB64, authTagB64, dek);
    expect(decrypted).toBe(plaintext);
  });

  it("decrypts JSON content (card/transaction data)", async () => {
    const jsonData = JSON.stringify({
      merchant: "Shell",
      amount: 250.0,
      currency: "BRL",
    });

    const dek = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const importedKey = await crypto.subtle.importKey(
      "raw",
      dek,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      importedKey,
      new TextEncoder().encode(jsonData)
    );

    const encBytes = new Uint8Array(encrypted);
    const ciphertextB64 = bytesToBase64(encBytes.slice(0, encBytes.length - 16));
    const ivB64 = bytesToBase64(iv);
    const authTagB64 = bytesToBase64(encBytes.slice(encBytes.length - 16));

    const decrypted = await decrypt(ciphertextB64, ivB64, authTagB64, dek);
    expect(JSON.parse(decrypted)).toEqual({
      merchant: "Shell",
      amount: 250.0,
      currency: "BRL",
    });
  });

  it("throws on tampered ciphertext", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const importedKey = await crypto.subtle.importKey(
      "raw",
      dek,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      importedKey,
      new TextEncoder().encode("original data")
    );

    const encBytes = new Uint8Array(encrypted);
    const ciphertext = encBytes.slice(0, encBytes.length - 16);
    const authTag = encBytes.slice(encBytes.length - 16);

    // Tamper with ciphertext
    ciphertext[0] ^= 0xff;

    await expect(
      decrypt(bytesToBase64(ciphertext), bytesToBase64(iv), bytesToBase64(authTag), dek)
    ).rejects.toThrow(/decryption failed/i);
  });

  it("throws on wrong DEK", async () => {
    const correctDek = crypto.getRandomValues(new Uint8Array(32));
    const wrongDek = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const importedKey = await crypto.subtle.importKey(
      "raw",
      correctDek,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      importedKey,
      new TextEncoder().encode("secret data")
    );

    const encBytes = new Uint8Array(encrypted);
    const ciphertextB64 = bytesToBase64(encBytes.slice(0, encBytes.length - 16));
    const ivB64 = bytesToBase64(iv);
    const authTagB64 = bytesToBase64(encBytes.slice(encBytes.length - 16));

    await expect(
      decrypt(ciphertextB64, ivB64, authTagB64, wrongDek)
    ).rejects.toThrow(/decryption failed/i);
  });
});

describe("end-to-end: wrap → unwrap → encrypt → decrypt", () => {
  it("completes full crypto roundtrip", async () => {
    const masterPassword = "minha-senha-segura-123";
    const plaintext = "Nubank Mastercard ...4567 — R$ 89,90";

    // 1. Generate DEK
    const dek = crypto.getRandomValues(new Uint8Array(32));

    // 2. Generate salt and derive wrapping key
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltB64 = bytesToBase64(salt);
    const params = { iterations: 1000 };

    const passwordKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(masterPassword),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    const wrapKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 1000,
        hash: "SHA-256",
      },
      passwordKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );

    // 3. Wrap the DEK
    const wrapIv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: wrapIv, tagLength: 128 },
      wrapKey,
      dek
    );

    const wrappedDek = new Uint8Array(12 + wrapped.byteLength);
    wrappedDek.set(wrapIv, 0);
    wrappedDek.set(new Uint8Array(wrapped), 12);
    const wrappedDekB64 = bytesToBase64(wrappedDek);

    // 4. Encrypt plaintext with DEK
    const encIv = crypto.getRandomValues(new Uint8Array(12));
    const encKey = await crypto.subtle.importKey(
      "raw",
      dek,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: encIv, tagLength: 128 },
      encKey,
      new TextEncoder().encode(plaintext)
    );
    const encBytes = new Uint8Array(encrypted);
    const ciphertextB64 = bytesToBase64(encBytes.slice(0, encBytes.length - 16));
    const encIvB64 = bytesToBase64(encIv);
    const authTagB64 = bytesToBase64(encBytes.slice(encBytes.length - 16));

    // ── Now simulate the dashboard flow ──

    // 5. Derive key from master password
    const derivedKey = await deriveKey(masterPassword, saltB64, params);

    // 6. Unwrap the DEK
    const unwrappedDek = await unwrapDek(wrappedDekB64, derivedKey);

    // 7. Decrypt the data
    const decrypted = await decrypt(ciphertextB64, encIvB64, authTagB64, unwrappedDek);

    expect(decrypted).toBe(plaintext);
  });
});

describe("generateDekSalt", () => {
  it("returns a non-empty base64 string", () => {
    const salt = generateDekSalt();
    expect(typeof salt).toBe("string");
    expect(salt.length).toBeGreaterThan(0);
  });

  it("returns a 16-byte salt encoded as base64", () => {
    const salt = generateDekSalt();
    expect(base64ToBytes(salt).length).toBe(16);
  });

  it("produces different values on each call", () => {
    const salt1 = generateDekSalt();
    const salt2 = generateDekSalt();
    expect(salt1).not.toBe(salt2);
  });
});

describe("wrapDek", () => {
  it("wraps a DEK and the result can be unwrapped with the same password", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const password = "new-master-password";
    const salt = generateDekSalt();
    const params = { iterations: 1000 };

    const wrappedDekB64 = await wrapDek(dek, password, salt, params);

    // Unwrap using the same password
    const derivedKey = await deriveKey(password, salt, params);
    const unwrapped = await unwrapDek(wrappedDekB64, derivedKey);

    expect(unwrapped).toEqual(dek);
  });

  it("produces different ciphertexts for same inputs (random IV)", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const password = "same-password";
    const salt = generateDekSalt();
    const params = { iterations: 1000 };

    const wrapped1 = await wrapDek(dek, password, salt, params);
    const wrapped2 = await wrapDek(dek, password, salt, params);

    expect(wrapped1).not.toBe(wrapped2);
  });

  it("fails to unwrap with a different password", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const salt = generateDekSalt();
    const params = { iterations: 1000 };

    const wrappedDekB64 = await wrapDek(dek, "correct-password", salt, params);

    const wrongKey = await deriveKey("wrong-password", salt, params);
    await expect(unwrapDek(wrappedDekB64, wrongKey)).rejects.toThrow(
      "Decryption failed"
    );
  });

  it("round-trip: wrap with new password, unwrap, re-encrypt data, decrypt", async () => {
    // Simulate key rotation: old DEK still decrypts existing data after re-wrap
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const plaintext = '{"amount":99.99,"merchant":"Pão de Açúcar"}';

    // Encrypt some data with the DEK
    const { encrypted_data, iv, auth_tag } = await encrypt(plaintext, dek);

    // Rotate: re-wrap DEK under new master password
    const newPassword = "brand-new-master-password";
    const newSalt = generateDekSalt();
    const params = { iterations: 1000 };
    const newWrappedDekB64 = await wrapDek(dek, newPassword, newSalt, params);

    // Login with new password, unwrap DEK
    const newDerivedKey = await deriveKey(newPassword, newSalt, params);
    const recoveredDek = await unwrapDek(newWrappedDekB64, newDerivedKey);

    // Existing data still decrypts correctly
    const decrypted = await decrypt(encrypted_data, iv, auth_tag, recoveredDek);
    expect(decrypted).toBe(plaintext);
  });
});

describe("encrypt", () => {
  it("encrypts plaintext and returns base64 ciphertext, iv, and auth_tag", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const plaintext = "Nubank Mastercard ...4567";

    const result = await encrypt(plaintext, dek);

    expect(result.encrypted_data).toBeTruthy();
    expect(result.iv).toBeTruthy();
    expect(result.auth_tag).toBeTruthy();

    // IV should be 12 bytes = 16 base64 chars
    expect(base64ToBytes(result.iv).length).toBe(12);
    // Auth tag should be 16 bytes
    expect(base64ToBytes(result.auth_tag).length).toBe(16);
  });

  it("produces output that can be decrypted", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const plaintext = "Bradesco Visa ...1234 — Padaria R$ 8,50";

    const { encrypted_data, iv, auth_tag } = await encrypt(plaintext, dek);
    const decrypted = await decrypt(encrypted_data, iv, auth_tag, dek);

    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for same plaintext (random IV)", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const plaintext = "Same content";

    const result1 = await encrypt(plaintext, dek);
    const result2 = await encrypt(plaintext, dek);

    expect(result1.iv).not.toBe(result2.iv);
    expect(result1.encrypted_data).not.toBe(result2.encrypted_data);
  });

  it("handles UTF-8 content with special characters", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const plaintext = '{"label":"Cartão São Paulo","last_digits":"9876","brand":"Visa"}';

    const { encrypted_data, iv, auth_tag } = await encrypt(plaintext, dek);
    const decrypted = await decrypt(encrypted_data, iv, auth_tag, dek);

    expect(decrypted).toBe(plaintext);
  });
});
