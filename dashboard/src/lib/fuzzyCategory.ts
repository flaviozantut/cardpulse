/**
 * Fuzzy merchant name matching for auto-categorization.
 *
 * Handles merchant name variations that keyword rules cannot catch:
 * store numbers, punctuation separators, legal suffixes, and minor typos.
 *
 * Resolution pipeline (called after exact override lookup fails):
 * 1. Normalize both the incoming merchant and each override key.
 * 2. Check substring containment — if one normalized name fully contains
 *    the other and the length ratio is high enough, it is a match.
 * 3. Compute Levenshtein similarity — if score > 80% it is a match.
 * 4. Return the category of the best match, or null if nothing qualifies.
 *
 * Transactions matched here are tagged with `category_source: "auto_fuzzy"`.
 */

import type { CategoryOverrides } from "./overrides";

/** Similarity threshold above which a fuzzy match is accepted (0–1). */
const SIMILARITY_THRESHOLD = 0.8;


/**
 * Legal/corporate suffixes stripped from merchant names before comparison.
 *
 * Sorted longest-first so that "EIRELI ME" is removed before "ME".
 */
const STORE_SUFFIXES = [
  "EIRELI ME",
  "EIRELI",
  "LTDA ME",
  "LTDA EPP",
  "LTDA",
  "S/A",
  "S.A.",
  "S.A",
  "EPP",
  "ME",
  "SS",
];

/**
 * Normalizes a merchant name for fuzzy comparison.
 *
 * Steps applied in order:
 * 1. Uppercase
 * 2. Replace punctuation separators (*, -, /, .) with spaces
 * 3. Strip legal/corporate suffixes (LTDA, EIRELI, S/A, …)
 * 4. Remove standalone digit-only tokens (store numbers)
 * 5. Collapse whitespace
 *
 * @example
 * normalizeMerchant("IFOOD*RESTAURANTE 045") // "IFOOD RESTAURANTE"
 * normalizeMerchant("DROGASIL LTDA")          // "DROGASIL"
 */
export function normalizeMerchant(name: string): string {
  let n = name.toUpperCase();

  // Strip legal suffixes first, while dots/slashes are still present
  // (longest first to avoid partial removal, e.g. "EIRELI ME" before "ME")
  for (const suffix of STORE_SUFFIXES) {
    // Escape regex metacharacters in the suffix string (e.g. "/" in "S/A")
    const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?<=\\s)${escaped}\\s*$`, "i");
    n = n.replace(pattern, "");
  }

  // Replace common punctuation separators with a space
  n = n.replace(/[*\-/]/g, " ");

  // Remove all periods (abbreviation dots: S.P. → SP, S.A. → SA)
  n = n.replace(/\./g, "");

  // Remove standalone digit-only tokens (e.g. store numbers, branch codes)
  n = n.replace(/\b\d+\b/g, "");

  // Collapse multiple spaces and trim
  n = n.replace(/\s+/g, " ").trim();

  return n;
}

/**
 * Computes the Levenshtein edit distance between two strings.
 *
 * Uses a space-efficient two-row dynamic programming approach.
 *
 * @example
 * levenshteinDistance("SHEL", "SHELL") // 1
 * levenshteinDistance("NETFLIK", "NETFLIX") // 2
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // prev[j] = distance(a[0..i-1], b[0..j-1])
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i++) {
    const curr: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    prev = curr;
  }

  return prev[b.length];
}

/**
 * Returns a normalized similarity score between two strings (0–1).
 *
 * Score = 1 − (editDistance / maxLength).
 * Two empty strings return 1.0.
 *
 * @example
 * similarity("SHELL", "SHELL")   // 1.0
 * similarity("SHEL",  "SHELL")   // 0.8
 * similarity("",      "SHELL")   // 0.0
 */
export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

/**
 * Checks whether one normalized name is a word-boundary prefix of the other.
 *
 * Accepts matches where the override key is a leading word or full match of
 * the merchant string (or vice versa). This handles cases like:
 * - "UBER TRIP SP" → key "UBER" (key is a prefix word of merchant)
 * - "IFOOD BURGUER" → key "IFOOD" (same)
 *
 * Word boundary: the shorter string must be followed by a space or be equal.
 */
function containsMatch(normalized: string, key: string): boolean {
  if (!key || !normalized) return false;
  // key is a prefix word of normalized
  if (normalized === key || normalized.startsWith(key + " ")) return true;
  // normalized is a prefix word of key
  if (key === normalized || key.startsWith(normalized + " ")) return true;
  return false;
}

/**
 * Fuzzy-matches a merchant name against the learned override map.
 *
 * Returns the category string of the best matching override key, or null
 * if no key exceeds the similarity threshold.
 *
 * Both the input merchant and each override key are normalized before
 * comparison, so variations in casing, store numbers, punctuation, and
 * legal suffixes are handled transparently.
 *
 * @param merchant - Raw merchant name from the transaction payload
 * @param overrides - Merchant→category override map (keys in uppercase)
 *
 * @example
 * fuzzyMatchCategory("SHELL 045", { "SHELL": "Combustivel" }) // "Combustivel"
 * fuzzyMatchCategory("IFOOD*BURGUER", { "IFOOD": "Delivery" }) // "Delivery"
 * fuzzyMatchCategory("UNKNOWN STORE", { "SHELL": "Combustivel" }) // null
 */
export function fuzzyMatchCategory(
  merchant: string,
  overrides: CategoryOverrides,
): string | null {
  if (!merchant) return null;

  const keys = Object.keys(overrides);
  if (keys.length === 0) return null;

  const normalizedMerchant = normalizeMerchant(merchant);
  if (!normalizedMerchant) return null;

  let bestScore = 0;
  let bestCategory: string | null = null;

  for (const key of keys) {
    const normalizedKey = normalizeMerchant(key);
    if (!normalizedKey) continue;

    // Word-boundary prefix containment — fast path, treated as high confidence
    if (containsMatch(normalizedMerchant, normalizedKey)) {
      // Score proportional to how much of the merchant the key covers
      const score = Math.min(normalizedMerchant.length, normalizedKey.length) /
        Math.max(normalizedMerchant.length, normalizedKey.length);
      if (score > bestScore) {
        bestScore = score;
        bestCategory = overrides[key];
      }
      continue;
    }

    // Levenshtein similarity
    const score = similarity(normalizedMerchant, normalizedKey);
    if (score >= SIMILARITY_THRESHOLD && score > bestScore) {
      bestScore = score;
      bestCategory = overrides[key];
    }
  }

  return bestCategory;
}
