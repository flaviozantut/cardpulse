/**
 * Tests for fuzzy merchant name matching.
 *
 * Covers normalization, Levenshtein distance, similarity scoring,
 * and end-to-end fuzzy category lookup against an override map.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeMerchant,
  levenshteinDistance,
  similarity,
  fuzzyMatchCategory,
} from "./fuzzyCategory";
import type { CategoryOverrides } from "./overrides";

// ---------------------------------------------------------------------------
// normalizeMerchant
// ---------------------------------------------------------------------------

describe("normalizeMerchant", () => {
  it("converts to uppercase", () => {
    expect(normalizeMerchant("shell")).toBe("SHELL");
  });

  it("removes trailing store numbers", () => {
    expect(normalizeMerchant("MERCADO EXTRA 1005")).toBe("MERCADO EXTRA");
  });

  it("removes leading store numbers", () => {
    expect(normalizeMerchant("99 TAXI")).toBe("TAXI");
  });

  it("removes punctuation: asterisk separator", () => {
    expect(normalizeMerchant("IFOOD*RESTAURANTE")).toBe("IFOOD RESTAURANTE");
  });

  it("removes punctuation: hyphen separator", () => {
    expect(normalizeMerchant("DROGA-RAIA")).toBe("DROGA RAIA");
  });

  it("removes common store suffixes (LTDA)", () => {
    expect(normalizeMerchant("ATACADAO LTDA")).toBe("ATACADAO");
  });

  it("removes common store suffixes (EIRELI)", () => {
    expect(normalizeMerchant("PADARIA BOA VIDA EIRELI")).toBe(
      "PADARIA BOA VIDA",
    );
  });

  it("removes common store suffixes (S/A)", () => {
    expect(normalizeMerchant("PETROBRAS S/A")).toBe("PETROBRAS");
  });

  it("removes common store suffixes (S.A)", () => {
    expect(normalizeMerchant("BRADESCO S.A")).toBe("BRADESCO");
  });

  it("removes common store suffixes (ME)", () => {
    expect(normalizeMerchant("BARBEARIA TOP ME")).toBe("BARBEARIA TOP");
  });

  it("removes common store suffixes (EPP)", () => {
    expect(normalizeMerchant("CONSULTORIA XYZ EPP")).toBe("CONSULTORIA XYZ");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeMerchant("MERCADO   EXTRA")).toBe("MERCADO EXTRA");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeMerchant("  SHELL  ")).toBe("SHELL");
  });

  it("handles empty string", () => {
    expect(normalizeMerchant("")).toBe("");
  });

  it("removes period from abbreviations", () => {
    expect(normalizeMerchant("DROGARIA S.P.")).toBe("DROGARIA SP");
  });
});

// ---------------------------------------------------------------------------
// levenshteinDistance
// ---------------------------------------------------------------------------

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("SHELL", "SHELL")).toBe(0);
  });

  it("returns string length for empty vs non-empty", () => {
    expect(levenshteinDistance("", "SHELL")).toBe(5);
    expect(levenshteinDistance("SHELL", "")).toBe(5);
  });

  it("returns 1 for single substitution", () => {
    // SHXLL vs SHELL
    expect(levenshteinDistance("SHXLL", "SHELL")).toBe(1);
  });

  it("returns 1 for single insertion", () => {
    // SHEL vs SHELL
    expect(levenshteinDistance("SHEL", "SHELL")).toBe(1);
  });

  it("returns 1 for single deletion", () => {
    // SHELLS vs SHELL
    expect(levenshteinDistance("SHELLS", "SHELL")).toBe(1);
  });

  it("handles transpositions correctly", () => {
    // MERCAD O vs MERCADO — swap adjacent chars
    expect(levenshteinDistance("MERCAOD", "MERCADO")).toBe(2);
  });

  it("returns 2 for two-substitution pair (DROGARAI vs DROGARIA)", () => {
    // D-R-O-G-A-R-A-I vs D-R-O-G-A-R-I-A — positions 7 and 8 differ
    expect(levenshteinDistance("DROGARAI", "DROGARIA")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// similarity
// ---------------------------------------------------------------------------

describe("similarity", () => {
  it("returns 1.0 for identical strings", () => {
    expect(similarity("SHELL", "SHELL")).toBe(1.0);
  });

  it("returns 0.0 for completely different strings of same length", () => {
    // "AAAA" vs "BBBB" — 4 substitutions out of 4
    expect(similarity("AAAA", "BBBB")).toBe(0.0);
  });

  it("returns 1.0 for two empty strings", () => {
    expect(similarity("", "")).toBe(1.0);
  });

  it("returns 0.0 when one string is empty", () => {
    expect(similarity("", "SHELL")).toBe(0.0);
    expect(similarity("SHELL", "")).toBe(0.0);
  });

  it("returns > 0.8 for single-char typo in short word", () => {
    // SHEL vs SHELL — distance 1, max 5 → 0.8
    expect(similarity("SHEL", "SHELL")).toBeGreaterThanOrEqual(0.8);
  });

  it("returns > 0.8 for name with trailing store number", () => {
    // After normalization both become "MERCADO EXTRA"
    const a = normalizeMerchant("MERCADO EXTRA 1005");
    const b = normalizeMerchant("MERCADO EXTRA");
    expect(similarity(a, b)).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// fuzzyMatchCategory — known variation pairs
// ---------------------------------------------------------------------------

describe("fuzzyMatchCategory", () => {
  const overrides: CategoryOverrides = {
    "SHELL": "Combustivel",
    "MERCADO EXTRA": "Supermercado",
    "IFOOD": "Delivery",
    "DROGASIL": "Farmacia",
    "NETFLIX": "Assinatura",
    "PADARIA BOA VIDA": "Restaurante",
    "UBER": "Transporte",
  };

  // --- Store number variations ---
  it("matches 'SHELL 045' to SHELL override (trailing number)", () => {
    expect(fuzzyMatchCategory("SHELL 045", overrides)).toBe("Combustivel");
  });

  it("matches 'MERCADO EXTRA 1005' to MERCADO EXTRA override", () => {
    expect(fuzzyMatchCategory("MERCADO EXTRA 1005", overrides)).toBe(
      "Supermercado",
    );
  });

  // --- Punctuation/separator variations ---
  it("matches 'IFOOD*BURGUER' to IFOOD override (asterisk separator)", () => {
    expect(fuzzyMatchCategory("IFOOD*BURGUER", overrides)).toBe("Delivery");
  });

  it("matches 'SHELL*AUTO POSTO' to SHELL override (asterisk+suffix)", () => {
    expect(fuzzyMatchCategory("SHELL*AUTO POSTO", overrides)).toBe(
      "Combustivel",
    );
  });

  // --- Suffix variations ---
  it("matches 'DROGASIL LTDA' to DROGASIL override (LTDA suffix)", () => {
    expect(fuzzyMatchCategory("DROGASIL LTDA", overrides)).toBe("Farmacia");
  });

  it("matches 'PADARIA BOA VIDA EIRELI' to override (EIRELI suffix)", () => {
    expect(fuzzyMatchCategory("PADARIA BOA VIDA EIRELI", overrides)).toBe(
      "Restaurante",
    );
  });

  // --- Minor typo variations ---
  it("matches 'NETFLIK' (typo) to NETFLIX override", () => {
    expect(fuzzyMatchCategory("NETFLIK", overrides)).toBe("Assinatura");
  });

  it("matches 'DROGASLL' (single typo) to DROGASIL override", () => {
    expect(fuzzyMatchCategory("DROGASLL", overrides)).toBe("Farmacia");
  });

  // --- Substring containment ---
  it("matches 'UBER TRIP SP' to UBER override via substring", () => {
    expect(fuzzyMatchCategory("UBER TRIP SP", overrides)).toBe("Transporte");
  });

  // --- No match scenarios ---
  it("returns null for completely unrelated merchant", () => {
    expect(fuzzyMatchCategory("COMERCIO DESCONHECIDO XYZ", overrides)).toBeNull();
  });

  it("returns null for empty merchant", () => {
    expect(fuzzyMatchCategory("", overrides)).toBeNull();
  });

  it("returns null when overrides map is empty", () => {
    expect(fuzzyMatchCategory("SHELL", {})).toBeNull();
  });

  // --- Priority: exact override takes priority (tested in transaction-data) ---
  it("returns null below 80% threshold", () => {
    // "ABCDE" vs "SHELL" — very different, should not match
    expect(fuzzyMatchCategory("ABCDE", overrides)).toBeNull();
  });
});
