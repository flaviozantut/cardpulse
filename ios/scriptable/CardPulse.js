// CardPulse — Scriptable SMS Capture Script
//
// Receives an SMS body from an iOS Shortcut, parses the bank transaction,
// encrypts it with AES-256-GCM using the DEK stored in iOS Keychain,
// and POSTs the encrypted blob to the CardPulse API.
//
// Setup:
//   1. Copy this file into the Scriptable app
//   2. Run the script once with the argument "setup" to store credentials
//   3. Create an iOS Shortcut that triggers on bank SMS and passes
//      the message body to this script via "Run Scriptable Script"

// ─── Configuration ──────────────────────────────────────────────────────────

const CONFIG = {
  // CardPulse API base URL (no trailing slash)
  apiBaseUrl: "https://cardpulse-api.fly.dev",

  // Keychain keys for stored credentials
  keychainTokenKey: "cardpulse_jwt_token",
  keychainDekKey: "cardpulse_dek",
  keychainCardMapKey: "cardpulse_card_map",
  keychainDefaultCardIdKey: "cardpulse_default_card_id",
  // Cached category overrides (merchant→category map from server config blob)
  keychainOverridesKey: "cardpulse_category_overrides",

  // Deduplication: ignore duplicate SMS received within this window (seconds)
  deduplicationWindowSecs: 30,

  // File for tracking recently processed messages
  deduplicationFile: "cardpulse_recent_sms.json",

  // Network retry configuration
  maxRetries: 3,
  retryDelayMs: 2000,
};

// ─── Entry Point ────────────────────────────────────────────────────────────

async function main() {
  const input = args.shortcutParameter || args.plainTexts?.[0];

  // Handle setup mode
  if (input === "setup") {
    await runSetup();
    return;
  }

  // Handle card mapping mode
  if (input === "cards") {
    await runCardMapping();
    return;
  }

  // Validate input — handle empty body edge case
  if (!input || typeof input !== "string" || input.trim().length === 0) {
    console.log("Empty or missing SMS body — skipping.");
    Script.complete();
    return;
  }

  const smsBody = input.trim();

  // Deduplication — skip if same SMS was processed recently
  if (isDuplicate(smsBody)) {
    console.log("Duplicate SMS detected — skipping.");
    Script.complete();
    return;
  }

  // Load credentials from Keychain
  const token = Keychain.get(CONFIG.keychainTokenKey);
  const dekBase64 = Keychain.get(CONFIG.keychainDekKey);

  if (!token || !dekBase64) {
    notify(
      "CardPulse Setup Required",
      'Run this script with argument "setup" to configure credentials.'
    );
    Script.complete();
    return;
  }

  // Parse the SMS into structured transaction data
  const parsed = parseBankSms(smsBody);
  if (!parsed) {
    notify(
      "CardPulse Parse Error",
      "SMS did not match any known bank format. Check the Scriptable console for the raw message."
    );
    console.error(`Unrecognized SMS format:\n${smsBody}`);
    Script.complete();
    return;
  }

  // Resolve card_id from last_digits via card mapping
  const cardId = resolveCardId(parsed.last_digits);
  if (!cardId) {
    notify(
      "CardPulse Card Not Found",
      `No card mapped for last digits "${parsed.last_digits}". Run with argument "cards" to configure card mapping.`
    );
    Script.complete();
    return;
  }

  // Load category overrides (learned from user corrections in the dashboard).
  // Overrides are fetched from the server and cached in Keychain to avoid
  // a network round-trip on every SMS. The cache is refreshed each run.
  const categoryOverrides = await loadCategoryOverrides(token, dekBase64);

  // Resolve category: learned overrides take priority over keyword dictionary
  const overrideCategory = lookupCategoryOverride(categoryOverrides, parsed.merchant);
  const keywordCategory = overrideCategory === null ? autoCategory(parsed.merchant) : null;
  const detectedCategory = overrideCategory ?? keywordCategory;
  const categorySource = overrideCategory !== null
    ? "auto_learned"
    : keywordCategory !== null
      ? "auto_keyword"
      : null;

  // Build the plaintext JSON to encrypt
  const plaintextPayload = {
    card_name: parsed.card_name,
    last_digits: parsed.last_digits,
    merchant: parsed.merchant,
    amount: parsed.amount,
    currency: parsed.currency,
    date: parsed.date,
    time: parsed.time,
    category: detectedCategory || "uncategorized",
    raw_sms: smsBody,
  };

  // Record the auto-categorization source so the dashboard can distinguish
  // keyword-matched and override-matched categories from manually set ones
  if (categorySource) {
    plaintextPayload.category_source = categorySource;
  }

  const plaintext = JSON.stringify(plaintextPayload);

  // Encrypt with AES-256-GCM using random IV
  const dek = Data.fromBase64String(dekBase64);
  const encrypted = await encryptAesGcm(plaintext, dek);

  // Compute timestamp_bucket as YYYY-MM from transaction date
  const bucket = deriveTimestampBucket(parsed.date);

  // POST to the CardPulse API with retry on network error
  const payload = {
    card_id: cardId,
    encrypted_data: encrypted.ciphertext,
    iv: encrypted.iv,
    auth_tag: encrypted.authTag,
    timestamp_bucket: bucket,
  };

  const success = await postTransactionWithRetry(token, payload);

  if (success) {
    markAsProcessed(smsBody);
    console.log(
      `Transaction recorded: ${parsed.merchant} ${parsed.currency} ${parsed.amount} [${parsed.card_name} ...${parsed.last_digits}]`
    );
  }

  Script.complete();
}

// ─── SMS Parsing ────────────────────────────────────────────────────────────

// Parser chain — each function returns a parsed object or null.
// Add new bank formats by appending to this array.
// Specific parsers go first; generic fallback goes last.
const PARSERS = [parseBradesco, parseGenericBrazilian];

/**
 * Attempts to parse an SMS body using the parser chain.
 * Returns the first successful match, or null if none match.
 *
 * Parsed object shape:
 *   { card_name, last_digits, merchant, amount, currency, date, time }
 */
function parseBankSms(smsBody) {
  for (const parser of PARSERS) {
    const result = parser(smsBody);
    if (result) return result;
  }
  return null;
}

/**
 * Parses Bradesco-style SMS:
 * "Compra aprovada no seu PERSON BLACK PONTOS final 1234 -
 *  MERCADO EXTRA-1005 valor R$ 35,94 em 15/03, as 13h19."
 *
 * Extracts: card_name, last_digits, merchant, amount, date, time
 */
function parseBradesco(sms) {
  // Match card name (text after "seu" and before "final") and last digits
  const cardPattern =
    /(?:no\s+seu|seu)\s+(.+?)\s+final\s+(\d{3,4}|\*{3,4})/i;
  const cardMatch = sms.match(cardPattern);

  // Match merchant, amount, date, and optional time
  const txPattern =
    /-\s*(.+?)\s+valor\s+R\$\s*([\d.,]+)\s+em\s+(\d{2}\/\d{2})(?:,\s*(?:as|às)\s+(\d{2}h\d{2}))?/i;
  const txMatch = sms.match(txPattern);

  if (!txMatch) return null;

  return {
    card_name: cardMatch ? cardMatch[1].trim() : "Unknown",
    last_digits: cardMatch ? cardMatch[2].replace(/\*/g, "") : "0000",
    merchant: txMatch[1].trim(),
    amount: parseAmount(txMatch[2]),
    currency: "BRL",
    date: normalizeDate(txMatch[3]),
    time: txMatch[4] ? txMatch[4].replace("h", ":") : null,
  };
}

/**
 * Generic Brazilian bank SMS parser.
 * Matches patterns like "final XXXX" for card info and "valor R$ XX,XX"
 * for transaction data. Falls back to defaults for missing fields.
 */
function parseGenericBrazilian(sms) {
  const amountMatch = sms.match(/R\$\s*([\d.,]+)/i);
  if (!amountMatch) return null;

  const dateMatch = sms.match(/(\d{2}\/\d{2}(?:\/\d{2,4})?)/);

  // Extract card name and last digits
  const cardPattern = /(?:cartao|cartão|seu)\s+(.+?)\s+final\s+(\d{3,4})/i;
  const cardMatch = sms.match(cardPattern);

  // Extract last digits from alternative patterns
  const digitsPattern = /final\s+(\d{3,4})/i;
  const digitsMatch = sms.match(digitsPattern);

  // Try to extract merchant
  let merchant = "Unknown";
  const merchantMatch = sms.match(/-\s*(.+?)\s+valor/i);
  if (merchantMatch) {
    merchant = merchantMatch[1].trim();
  }

  return {
    card_name: cardMatch ? cardMatch[1].trim() : "Unknown",
    last_digits: cardMatch
      ? cardMatch[2]
      : digitsMatch
        ? digitsMatch[1]
        : "0000",
    merchant,
    amount: parseAmount(amountMatch[1]),
    currency: "BRL",
    date: dateMatch ? normalizeDate(dateMatch[1]) : todayIso(),
    time: null,
  };
}

/**
 * Parses a Brazilian amount string like "1.234,56" into a float string.
 */
function parseAmount(raw) {
  return raw.replace(/\./g, "").replace(",", ".");
}

/**
 * Normalizes a DD/MM or DD/MM/YYYY date to ISO YYYY-MM-DD.
 */
function normalizeDate(raw) {
  const parts = raw.split("/");
  const day = parts[0];
  const month = parts[1];
  const year =
    parts.length > 2 ? normalizeYear(parts[2]) : new Date().getFullYear();
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * Normalizes a 2- or 4-digit year.
 */
function normalizeYear(raw) {
  if (raw.length === 4) return raw;
  const prefix = parseInt(raw) > 50 ? "19" : "20";
  return prefix + raw;
}

/**
 * Returns today's date in ISO format.
 */
function todayIso() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Derives a YYYY-MM bucket from an ISO date string.
 */
function deriveTimestampBucket(isoDate) {
  return isoDate.substring(0, 7);
}

// ─── Card Mapping ───────────────────────────────────────────────────────────

/**
 * Resolves a card_id from the last digits of the card number.
 *
 * Uses the configurable card mapping stored in the Keychain.
 * The mapping is a JSON object: { "1234": "uuid-...", "5678": "uuid-..." }
 * Falls back to the default card ID if no mapping is found.
 */
function resolveCardId(lastDigits) {
  const mapJson = Keychain.get(CONFIG.keychainCardMapKey);
  if (mapJson) {
    try {
      const cardMap = JSON.parse(mapJson);
      if (cardMap[lastDigits]) {
        return cardMap[lastDigits];
      }
    } catch {
      console.error("Failed to parse card mapping from Keychain.");
    }
  }

  // Fall back to default card ID
  return Keychain.get(CONFIG.keychainDefaultCardIdKey) || null;
}

/**
 * Loads the current card mapping from Keychain.
 */
function loadCardMap() {
  const mapJson = Keychain.get(CONFIG.keychainCardMapKey);
  if (!mapJson) return {};
  try {
    return JSON.parse(mapJson);
  } catch {
    return {};
  }
}

/**
 * Saves the card mapping to Keychain.
 */
function saveCardMap(cardMap) {
  Keychain.set(CONFIG.keychainCardMapKey, JSON.stringify(cardMap));
}

// ─── Encryption ─────────────────────────────────────────────────────────────

/**
 * Encrypts plaintext with AES-256-GCM using a random 12-byte IV.
 *
 * Returns { ciphertext, iv, authTag } as base64 strings.
 * Uses the Web Crypto API available in Scriptable's JavaScript runtime.
 */
async function encryptAesGcm(plaintext, dekData) {
  // Generate a random 12-byte IV (unique per encryption)
  const iv = generateRandomBytes(12);

  // Import the DEK as a CryptoKey for AES-256-GCM
  const key = await crypto.subtle.importKey(
    "raw",
    dekData.getBytes(),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  // Encrypt with AES-256-GCM (128-bit auth tag)
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.getBytes(), tagLength: 128 },
    key,
    plaintextBytes
  );

  // AES-GCM appends the 16-byte auth tag to the ciphertext
  const encryptedBytes = new Uint8Array(encrypted);
  const ciphertextBytes = encryptedBytes.slice(0, encryptedBytes.length - 16);
  const authTagBytes = encryptedBytes.slice(encryptedBytes.length - 16);

  return {
    ciphertext: Data.fromBytes(Array.from(ciphertextBytes)).toBase64String(),
    iv: iv.toBase64String(),
    authTag: Data.fromBytes(Array.from(authTagBytes)).toBase64String(),
  };
}

/**
 * Generates cryptographically random bytes.
 */
function generateRandomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Data.fromBytes(Array.from(bytes));
}

// ─── DEK Derivation ─────────────────────────────────────────────────────────

/**
 * Derives the DEK from the master password using the wrapped DEK and salt
 * returned by the server during login.
 *
 * The server stores the DEK encrypted (wrapped) with a key derived from the
 * master password via Argon2id. Since WebCrypto doesn't support Argon2, we
 * use PBKDF2 as the client-side KDF for unwrapping.
 *
 * Flow:
 *   1. Derive an unwrap key from master password + dek_salt via PBKDF2
 *   2. Decrypt (unwrap) the wrapped_dek using AES-GCM with the derived key
 *   3. The result is the raw 256-bit DEK
 */
async function deriveDek(masterPassword, wrappedDekBase64, dekSaltBase64, dekParams) {
  const encoder = new TextEncoder();
  const salt = Data.fromBase64String(dekSaltBase64).getBytes();
  const iterations = dekParams?.iterations || 600000;

  // Import master password as key material for PBKDF2
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(masterPassword),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  // Derive the unwrap key via PBKDF2
  const unwrapKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: iterations,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  // Unwrap the DEK — the wrapped_dek contains IV (12 bytes) + ciphertext + tag
  const wrappedBytes = Data.fromBase64String(wrappedDekBase64).getBytes();
  const wrappedIv = wrappedBytes.slice(0, 12);
  const wrappedCiphertext = wrappedBytes.slice(12);

  const dekBytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: wrappedIv, tagLength: 128 },
    unwrapKey,
    wrappedCiphertext
  );

  return Data.fromBytes(Array.from(new Uint8Array(dekBytes))).toBase64String();
}

// ─── API Communication ──────────────────────────────────────────────────────

/**
 * Posts an encrypted transaction to the CardPulse API with retry logic.
 *
 * Retries up to CONFIG.maxRetries times on network errors with exponential
 * backoff. Returns true on success, false on permanent failure.
 */
async function postTransactionWithRetry(token, payload) {
  for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
    const result = await postTransaction(token, payload);

    if (result.success) return true;

    // Don't retry on auth or validation errors — these are permanent
    if (result.permanent) return false;

    // Network error — retry with exponential backoff
    if (attempt < CONFIG.maxRetries) {
      const delay = CONFIG.retryDelayMs * Math.pow(2, attempt - 1);
      console.log(
        `Network error on attempt ${attempt}/${CONFIG.maxRetries}. Retrying in ${delay}ms...`
      );
      await sleep(delay);
    }
  }

  notify(
    "CardPulse Network Error",
    `Failed to send transaction after ${CONFIG.maxRetries} attempts. Will retry on next SMS.`
  );
  return false;
}

/**
 * Posts an encrypted transaction to the CardPulse API.
 *
 * Returns { success: bool, permanent: bool } where permanent indicates
 * whether the error is not worth retrying.
 */
async function postTransaction(token, payload) {
  const url = `${CONFIG.apiBaseUrl}/v1/transactions`;
  const req = new Request(url);
  req.method = "POST";
  req.headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  req.body = JSON.stringify(payload);

  try {
    const response = await req.loadJSON();

    if (req.response.statusCode === 201) {
      return { success: true, permanent: false };
    }

    if (req.response.statusCode === 401) {
      notify(
        "CardPulse Auth Expired",
        "Your token has expired. Please run setup again."
      );
      return { success: false, permanent: true };
    }

    if (req.response.statusCode === 422) {
      notify(
        "CardPulse Validation Error",
        `Invalid payload: ${response?.error?.message || "unknown error"}`
      );
      return { success: false, permanent: true };
    }

    console.error(
      `API error ${req.response.statusCode}: ${JSON.stringify(response)}`
    );
    return { success: false, permanent: true };
  } catch (error) {
    // Network error — retryable
    console.error(`Network error: ${error.message}`);
    return { success: false, permanent: false };
  }
}

/**
 * Async sleep helper for retry backoff.
 */
function sleep(ms) {
  return new Promise((resolve) => Timer.schedule(ms, false, resolve));
}

// ─── Deduplication ──────────────────────────────────────────────────────────

/**
 * Checks if the same SMS was already processed within the dedup window.
 */
function isDuplicate(smsBody) {
  const recent = loadRecentMessages();
  const now = Date.now();
  const windowMs = CONFIG.deduplicationWindowSecs * 1000;

  const hash = simpleHash(smsBody);

  return recent.some(
    (entry) => entry.hash === hash && now - entry.timestamp < windowMs
  );
}

/**
 * Records a processed SMS for deduplication.
 */
function markAsProcessed(smsBody) {
  const recent = loadRecentMessages();
  const now = Date.now();
  const windowMs = CONFIG.deduplicationWindowSecs * 1000;

  // Prune expired entries
  const active = recent.filter((e) => now - e.timestamp < windowMs);
  active.push({ hash: simpleHash(smsBody), timestamp: now });

  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), CONFIG.deduplicationFile);
  fm.writeString(path, JSON.stringify(active));
}

/**
 * Loads recently processed messages from disk.
 */
function loadRecentMessages() {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), CONFIG.deduplicationFile);

  if (!fm.fileExists(path)) return [];

  try {
    return JSON.parse(fm.readString(path));
  } catch {
    return [];
  }
}

/**
 * Simple string hash for deduplication (not cryptographic).
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString();
}

// ─── Setup ──────────────────────────────────────────────────────────────────

/**
 * Interactive setup flow — authenticates with the API, derives the DEK from
 * the master password, and stores everything in the iOS Keychain.
 *
 * The DEK is protected by the Keychain's device-level security (passcode /
 * Face ID / Touch ID). Scriptable uses the default Keychain accessibility
 * level which requires the device to be unlocked.
 */
async function runSetup() {
  // Step 1: Collect credentials
  const credAlert = new Alert();
  credAlert.title = "CardPulse Setup (1/2)";
  credAlert.message = "Enter your CardPulse API credentials.";
  credAlert.addTextField("API Base URL", CONFIG.apiBaseUrl);
  credAlert.addTextField("Email");
  credAlert.addSecureTextField("Password");
  credAlert.addAction("Next");
  credAlert.addCancelAction("Cancel");

  const credIdx = await credAlert.presentAlert();
  if (credIdx === -1) return;

  const baseUrl = credAlert.textFieldValue(0).trim();
  const email = credAlert.textFieldValue(1).trim();
  const password = credAlert.textFieldValue(2);

  // Step 2: Login to get token and wrapped DEK
  const loginReq = new Request(`${baseUrl}/auth/login`);
  loginReq.method = "POST";
  loginReq.headers = { "Content-Type": "application/json" };
  loginReq.body = JSON.stringify({ email, password });

  let loginData;
  try {
    const response = await loginReq.loadJSON();

    if (loginReq.response.statusCode !== 200) {
      notify("CardPulse Setup Failed", "Invalid credentials.");
      return;
    }

    loginData = response.data;
  } catch (error) {
    notify("CardPulse Setup Error", `Login failed: ${error.message}`);
    return;
  }

  // Step 3: Collect master password for DEK derivation
  const dekAlert = new Alert();
  dekAlert.title = "CardPulse Setup (2/2)";
  dekAlert.message =
    "Enter your master password to derive the encryption key.\n\n" +
    "This is the password you used when creating your account in the " +
    "dashboard. It is NOT the same as your API login password.";
  dekAlert.addSecureTextField("Master Password");
  dekAlert.addAction("Derive & Save");
  dekAlert.addCancelAction("Cancel");

  const dekIdx = await dekAlert.presentAlert();
  if (dekIdx === -1) return;

  const masterPassword = dekAlert.textFieldValue(0);

  // Step 4: Derive DEK from master password + server-provided wrapped DEK
  try {
    const dekBase64 = await deriveDek(
      masterPassword,
      loginData.wrapped_dek,
      loginData.dek_salt,
      loginData.dek_params
    );

    // Store everything in the iOS Keychain
    // Keychain entries are protected by the device passcode / Face ID
    Keychain.set(CONFIG.keychainTokenKey, loginData.token);
    Keychain.set(CONFIG.keychainDekKey, dekBase64);

    // Update API base URL if changed
    if (baseUrl !== CONFIG.apiBaseUrl) {
      console.log(`API URL updated to: ${baseUrl}`);
    }

    notify(
      "CardPulse Setup Complete",
      "Credentials and encryption key saved to Keychain.\n\n" +
        'Run with argument "cards" to configure card mapping.'
    );

    console.log("Setup complete. Token and DEK stored in Keychain.");
  } catch (error) {
    notify(
      "CardPulse DEK Error",
      "Failed to derive encryption key. Check your master password."
    );
    console.error(`DEK derivation error: ${error.message}`);
  }
}

/**
 * Interactive card mapping flow — maps card last digits to card UUIDs.
 *
 * This allows the script to automatically route transactions to the correct
 * card based on the last digits extracted from the SMS.
 */
async function runCardMapping() {
  const token = Keychain.get(CONFIG.keychainTokenKey);
  if (!token) {
    notify(
      "CardPulse Setup Required",
      'Run this script with argument "setup" first.'
    );
    return;
  }

  // Fetch existing cards from the API
  const cardsReq = new Request(`${CONFIG.apiBaseUrl}/v1/cards`);
  cardsReq.headers = { Authorization: `Bearer ${token}` };

  let cards = [];
  try {
    const response = await cardsReq.loadJSON();
    if (cardsReq.response.statusCode === 200) {
      cards = response.data || [];
    }
  } catch (error) {
    console.error(`Failed to fetch cards: ${error.message}`);
  }

  const currentMap = loadCardMap();

  const alert = new Alert();
  alert.title = "Card Mapping";
  alert.message =
    "Map card last digits to card IDs.\n\n" +
    `You have ${cards.length} card(s) in the API.\n` +
    `Current mappings: ${Object.keys(currentMap).length}\n\n` +
    "Enter last 4 digits and the card UUID.";

  alert.addTextField("Last 4 Digits (e.g., 1234)");
  alert.addTextField("Card UUID");
  alert.addTextField("Default Card UUID (fallback)");
  alert.addAction("Add Mapping");
  alert.addAction("View Current Mappings");
  alert.addCancelAction("Done");

  const idx = await alert.presentAlert();

  if (idx === 0) {
    // Add mapping
    const digits = alert.textFieldValue(0).trim();
    const cardId = alert.textFieldValue(1).trim();
    const defaultId = alert.textFieldValue(2).trim();

    if (digits && cardId) {
      currentMap[digits] = cardId;
      saveCardMap(currentMap);
      console.log(`Mapped card ...${digits} → ${cardId}`);
    }

    if (defaultId) {
      Keychain.set(CONFIG.keychainDefaultCardIdKey, defaultId);
      console.log(`Default card set to: ${defaultId}`);
    }

    notify(
      "CardPulse Card Mapping Updated",
      `Card ...${digits} mapped successfully.\nTotal mappings: ${Object.keys(currentMap).length}`
    );
  } else if (idx === 1) {
    // View mappings
    const entries = Object.entries(currentMap);
    const defaultId = Keychain.get(CONFIG.keychainDefaultCardIdKey);
    let msg = entries.length === 0 ? "No card mappings configured.\n" : "";

    for (const [digits, id] of entries) {
      msg += `...${digits} → ${id.substring(0, 8)}...\n`;
    }

    if (defaultId) {
      msg += `\nDefault: ${defaultId.substring(0, 8)}...`;
    }

    const viewAlert = new Alert();
    viewAlert.title = "Current Card Mappings";
    viewAlert.message = msg;
    viewAlert.addAction("OK");
    await viewAlert.presentAlert();
  }
}

// ─── Auto-Categorization ─────────────────────────────────────────────────────

// Mirrors the keyword rules in dashboard/src/lib/categoryRules.ts.
// Rules are ordered by specificity — more specific patterns come first.
const CATEGORY_RULES = [
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
 * Returns the matched category string or null if no pattern matches.
 */
function autoCategory(merchant) {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(merchant)) {
      return rule.category;
    }
  }
  return null;
}

// ─── Category Overrides ──────────────────────────────────────────────────────

/**
 * Fetches the category overrides config blob from the server, decrypts it,
 * and caches the result in Keychain.
 *
 * Returns a merchant→category map (keys normalized to uppercase).
 * Returns an empty object if no overrides are stored or on any error.
 *
 * @param {string} token - JWT access token
 * @param {string} dekBase64 - Base64-encoded DEK from Keychain
 * @returns {Promise<Record<string, string>>}
 */
async function loadCategoryOverrides(token, dekBase64) {
  // Try fetching from the server (overrides may have been updated from the dashboard)
  try {
    const req = new Request(`${CONFIG.apiBaseUrl}/v1/config/category_overrides`);
    req.headers = { Authorization: `Bearer ${token}` };
    const response = await req.loadJSON();

    if (req.response.statusCode === 200 && response.data) {
      const config = response.data;
      const dek = Data.fromBase64String(dekBase64);
      const plaintext = await decryptAesGcm(config.encrypted_data, config.iv, config.auth_tag, dek);
      const overrides = JSON.parse(plaintext);

      // Cache the decrypted overrides for offline use
      Keychain.set(CONFIG.keychainOverridesKey, JSON.stringify(overrides));
      return overrides;
    }

    // 404 means no overrides saved yet — return empty map
    if (req.response.statusCode === 404) {
      return {};
    }
  } catch (error) {
    console.log(`Could not fetch overrides from server: ${error.message}. Using cached value.`);
  }

  // Fall back to cached overrides from previous run
  const cached = Keychain.get(CONFIG.keychainOverridesKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      return {};
    }
  }

  return {};
}

/**
 * Looks up a merchant in the override map (case-insensitive).
 *
 * Returns the overridden category string, or null if no override exists.
 *
 * @param {Record<string, string>} overrides - Merchant→category map
 * @param {string} merchant - Merchant name to look up
 * @returns {string|null}
 */
function lookupCategoryOverride(overrides, merchant) {
  if (!overrides || typeof overrides !== "object") return null;
  return overrides[merchant.toUpperCase()] ?? null;
}

/**
 * Decrypts AES-256-GCM ciphertext using the DEK.
 *
 * Input fields are base64-encoded. The auth tag is concatenated to the
 * ciphertext before decryption (Web Crypto API convention).
 *
 * @param {string} ciphertextBase64 - Base64-encoded ciphertext (without auth tag)
 * @param {string} ivBase64 - Base64-encoded 12-byte IV
 * @param {string} authTagBase64 - Base64-encoded 16-byte auth tag
 * @param {Data} dekData - DEK as a Scriptable Data object
 * @returns {Promise<string>} - Decrypted UTF-8 string
 */
async function decryptAesGcm(ciphertextBase64, ivBase64, authTagBase64, dekData) {
  const ciphertext = Data.fromBase64String(ciphertextBase64).getBytes();
  const iv = Data.fromBase64String(ivBase64).getBytes();
  const authTag = Data.fromBase64String(authTagBase64).getBytes();

  // Web Crypto expects ciphertext + auth tag concatenated
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext, 0);
  combined.set(authTag, ciphertext.length);

  const key = await crypto.subtle.importKey(
    "raw",
    dekData.getBytes(),
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    combined
  );

  return new TextDecoder().decode(decrypted);
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/**
 * Shows a local notification to the user.
 */
function notify(title, body) {
  const n = new Notification();
  n.title = title;
  n.body = body;
  n.schedule();
}

// ─── Run ────────────────────────────────────────────────────────────────────

await main();
