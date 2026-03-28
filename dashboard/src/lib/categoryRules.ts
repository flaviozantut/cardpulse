/**
 * Auto-categorization rules for transactions based on merchant name keywords.
 *
 * Provides a keyword dictionary of regex patterns for common Brazilian merchants,
 * used to automatically assign categories during transaction creation (Scriptable)
 * and dashboard display.
 */

/** Valid transaction categories. */
export type Category =
  | "Supermercado"
  | "Delivery"
  | "Restaurante"
  | "Transporte"
  | "Combustivel"
  | "Farmacia"
  | "Saude"
  | "Assinatura"
  | "Games"
  | "Casa"
  | "Utilidades";

interface CategoryRule {
  category: Category;
  pattern: RegExp;
}

// Rules are ordered by specificity — more specific patterns come first
// to avoid false positives (e.g. Delivery before Transporte for Uber Eats,
// Games before Assinatura for PlayStation Store).
const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "Games",
    pattern:
      /playstation\s?store|psn\s?store|xbox\s?(store|live|game\s?pass)|epic\s?games|nintendo\s?(eshop|store)|nuuvem|gog\.com|\bsteam\b/i,
  },
  {
    // Delivery apps — must come before Transporte so Uber Eats is correctly matched
    category: "Delivery",
    pattern: /ifood|uber\s*[*.]?\s*eats|\brappi\b|james\s?delivery|99\s?food|delivery\s?much|hello\s?food/i,
  },
  {
    category: "Transporte",
    pattern:
      /\buber\b|99\s*(tecnologia|taxi|cab)|\bcabify\b|metro\s*(sp|rj|df|bh)?\b|cptm|sptrans|bilhete.?[uú]nico|latam|gol\s*(linhas|air)|azul\s*(linhas|air)|\bonibus\b|rodoviaria|aeroporto/i,
  },
  {
    category: "Combustivel",
    pattern:
      /\bshell\b|ipiranga|\bpetrobras\b|br\s?distribuidora|\bposto\b|\bcombust[ií]vel\b|\bgasolina\b|\betanol\b|\b[áa]lcool\b|\bdiesel\b/i,
  },
  {
    // Excludes Mercado Livre (online marketplace, not a supermarket)
    category: "Supermercado",
    pattern:
      /\bmercado(?!\s*livre)\b|carrefour|p[aã]o\s*de\s*a[cç][uú]car|hortifruti|assa[ií]|\batacad[aã]o\b|sam.?s\s*club|\bsonda\b|\btodo\s*dia\b|\bbretas\b|\bcomper\b|\benxuto\b|st\.?\s*march[eé]/i,
  },
  {
    category: "Farmacia",
    pattern:
      /drogasil|droga\s*raia|ultrafarma|\bpacheco\b|pague\s*menos|\bpanvel\b|\bnissei\b|farm[aá]cia|drogaria|drog[aã]o|\bgenix\b/i,
  },
  {
    category: "Saude",
    pattern:
      /\bhospital\b|cl[ií]nica|laborat[oó]rio|fleury|\bdasa\b|\bsabin\b|hermes\s*pardini|sorridents|odontos?|dentista|\bunimed\b|\bamil\b|sulam[eé]rica\s*sa[uú]de|bradesco\s*sa[uú]de/i,
  },
  {
    category: "Assinatura",
    pattern:
      /netflix|spotify|amazon\s*prime|prime\s*video|disney\s*[+p]|hbo\s*(max)?|apple\.com|google\s*one|globoplay|deezer|youtube\s*premium|adobe|microsoft\s*365|office\s*365|\bcanva\b|\bdropbox\b|\bicloud\b/i,
  },
  {
    category: "Restaurante",
    pattern:
      /restaurante|pizzaria|churrascaria|lanchonete|\bpadaria\b|\bsubway\b|mc\s*donald|bob.?s\s*(burguer?)?|burger\s*king|\bkfc\b|\bgiraffas\b|hab[ií]b|china\s*in\s*box|spoletto|\boutback\b|pizza\s*hut|domino.?s|\bsushi\b|frango\s*assado|\bvips\b/i,
  },
  {
    category: "Utilidades",
    pattern:
      /sabesp|copasa|\bcemig\b|\bcpfl\b|\benel\b|\bcelpe\b|\bcosern\b|\bcelg\b|\bvivo\b|\btim\b|\bclaro\b|\bnextel\b|\bctbc\b|net\s*(claro|fibra)|oi\s*(internet|fibra|tv)/i,
  },
  {
    category: "Casa",
    pattern:
      /leroy\s*merlin|telhanorte|tok\s*[&e]\s*stok|\btramontina\b|\bconsul\b|\bbrastemp\b|\belectrolux\b|\baluguel\b|condom[ií]nio|imobili[aá]ria/i,
  },
];

/**
 * Matches a merchant name against the keyword dictionary to determine
 * its category automatically.
 *
 * Returns the matched category or null if no pattern matches.
 * Rules are evaluated in order — the first match wins.
 *
 * @example
 * autoCategory("MERCADO EXTRA-1005") // "Supermercado"
 * autoCategory("IFOOD*RESTAURANTE")  // "Delivery"
 * autoCategory("Unknown Merchant")   // null
 */
export function autoCategory(merchant: string): Category | null {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(merchant)) {
      return rule.category;
    }
  }
  return null;
}
