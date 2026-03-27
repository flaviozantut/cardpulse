import { describe, it, expect } from "vitest";
import { decryptCard, encryptCardData, formatCardLabel } from "./card-data";
import { encrypt, decrypt, base64ToBytes } from "./crypto";

function makeEncrypted(dek: Uint8Array) {
  return async (plaintext: string) => {
    const result = await encrypt(plaintext, dek);
    return {
      id: "card-1",
      user_id: "user-1",
      encrypted_data: result.encrypted_data,
      iv: result.iv,
      auth_tag: result.auth_tag,
      created_at: "2026-03-15T10:00:00Z",
    };
  };
}

describe("decryptCard", () => {
  it("decrypts a card with JSON encrypted_data", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const make = makeEncrypted(dek);
    const card = await make(
      JSON.stringify({ label: "Nubank Platinum", last_digits: "4567", brand: "Mastercard" })
    );

    const result = await decryptCard(card, dek);

    expect(result.id).toBe("card-1");
    expect(result.label).toBe("Nubank Platinum");
    expect(result.last_digits).toBe("4567");
    expect(result.brand).toBe("Mastercard");
    expect(result.created_at).toBe("2026-03-15T10:00:00Z");
  });

  it("handles plaintext (non-JSON) encrypted_data", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const make = makeEncrypted(dek);
    const card = await make("Nubank ...4567");

    const result = await decryptCard(card, dek);

    expect(result.label).toBe("Nubank ...4567");
    expect(result.last_digits).toBe("");
    expect(result.brand).toBe("");
  });

  it("returns placeholder on decryption failure", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const wrongDek = crypto.getRandomValues(new Uint8Array(32));
    const make = makeEncrypted(dek);
    const card = await make("secret card data");

    const result = await decryptCard(card, wrongDek);

    expect(result.label).toBe("[Decryption failed]");
  });
});

describe("encryptCardData", () => {
  it("encrypts card data as JSON and returns encrypted fields", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));

    const result = await encryptCardData(
      { label: "Bradesco Visa", last_digits: "1234", brand: "Visa" },
      dek
    );

    expect(result.encrypted_data).toBeTruthy();
    expect(result.iv).toBeTruthy();
    expect(result.auth_tag).toBeTruthy();

    // Verify it can be decrypted back
    const decrypted = await decrypt(result.encrypted_data, result.iv, result.auth_tag, dek);
    const parsed = JSON.parse(decrypted);
    expect(parsed.label).toBe("Bradesco Visa");
    expect(parsed.last_digits).toBe("1234");
    expect(parsed.brand).toBe("Visa");
  });

  it("produces valid base64 with correct lengths", async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));

    const result = await encryptCardData(
      { label: "Test", last_digits: "0000", brand: "Test" },
      dek
    );

    expect(base64ToBytes(result.iv).length).toBe(12);
    expect(base64ToBytes(result.auth_tag).length).toBe(16);
  });
});

describe("formatCardLabel", () => {
  it("formats card with label and last digits", () => {
    expect(formatCardLabel("Nubank", "4567")).toBe("Nubank ••4567");
  });

  it("formats card with label only when no last digits", () => {
    expect(formatCardLabel("My Card", "")).toBe("My Card");
  });

  it("formats card with last digits only when no label", () => {
    expect(formatCardLabel("", "1234")).toBe("••1234");
  });

  it("returns fallback when both are empty", () => {
    expect(formatCardLabel("", "")).toBe("Unknown card");
  });
});
