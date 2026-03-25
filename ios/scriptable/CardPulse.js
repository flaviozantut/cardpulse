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
  keychainCardIdKey: "cardpulse_default_card_id",

  // Deduplication: ignore duplicate SMS received within this window (seconds)
  deduplicationWindowSecs: 30,

  // File for tracking recently processed messages
  deduplicationFile: "cardpulse_recent_sms.json",
};

// ─── Entry Point ────────────────────────────────────────────────────────────

async function main() {
  const input = args.shortcutParameter || args.plainTexts?.[0];

  // Handle setup mode
  if (input === "setup") {
    await runSetup();
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
  const cardId = Keychain.get(CONFIG.keychainCardIdKey);

  if (!token || !dekBase64 || !cardId) {
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
    console.log("SMS did not match any known bank format — skipping.");
    Script.complete();
    return;
  }

  // Build the plaintext JSON to encrypt
  const plaintext = JSON.stringify({
    merchant: parsed.merchant,
    amount: parsed.amount,
    currency: parsed.currency,
    date: parsed.date,
    time: parsed.time,
    raw_sms: smsBody,
  });

  // Encrypt with AES-256-GCM
  const dek = Data.fromBase64String(dekBase64);
  const encrypted = await encryptAesGcm(plaintext, dek);

  // Derive timestamp_bucket from parsed date (YYYY-MM)
  const bucket = deriveTimestampBucket(parsed.date);

  // POST to the CardPulse API
  const payload = {
    card_id: cardId,
    encrypted_data: encrypted.ciphertext,
    iv: encrypted.iv,
    auth_tag: encrypted.authTag,
    timestamp_bucket: bucket,
  };

  const success = await postTransaction(token, payload);

  if (success) {
    markAsProcessed(smsBody);
    console.log(`Transaction recorded: ${parsed.merchant} ${parsed.amount}`);
  }

  Script.complete();
}

// ─── SMS Parsing ────────────────────────────────────────────────────────────

// Parser chain — each function returns a parsed object or null.
// Add new bank formats by appending to this array.
const PARSERS = [parseBradesco, parseGenericBrazilian];

/**
 * Attempts to parse an SMS body using the parser chain.
 * Returns the first successful match, or null if none match.
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
 * "Compra aprovada no seu PERSON BLACK PONTOS final *** -
 *  MERCADO EXTRA-1005 valor R$ 35,94 em 15/03, as 13h19."
 */
function parseBradesco(sms) {
  const pattern =
    /Compra aprovada.*?-\s*(.+?)\s+valor\s+R\$\s*([\d.,]+)\s+em\s+(\d{2}\/\d{2})(?:,\s*(?:as|às)\s+(\d{2}h\d{2}))?/i;
  const match = sms.match(pattern);
  if (!match) return null;

  return {
    merchant: match[1].trim(),
    amount: parseAmount(match[2]),
    currency: "BRL",
    date: normalizeDate(match[3]),
    time: match[4] ? match[4].replace("h", ":") : null,
  };
}

/**
 * Generic Brazilian bank SMS parser:
 * Matches patterns like "valor R$ XX,XX" with merchant and date.
 */
function parseGenericBrazilian(sms) {
  const amountMatch = sms.match(/R\$\s*([\d.,]+)/i);
  const dateMatch = sms.match(/(\d{2}\/\d{2}(?:\/\d{2,4})?)/);

  if (!amountMatch) return null;

  // Try to extract merchant — text between "-" and "valor" or first
  // significant segment
  let merchant = "Unknown";
  const merchantMatch = sms.match(/-\s*(.+?)\s+valor/i);
  if (merchantMatch) {
    merchant = merchantMatch[1].trim();
  }

  return {
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
  // Remove thousands separator (.), replace decimal comma with dot
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

// ─── Encryption ─────────────────────────────────────────────────────────────

/**
 * Encrypts plaintext with AES-256-GCM.
 *
 * Returns { ciphertext, iv, authTag } as base64 strings.
 * Uses Scriptable's built-in Data API for byte operations.
 */
async function encryptAesGcm(plaintext, dekData) {
  // Generate a random 12-byte IV
  const iv = generateRandomBytes(12);

  // Import the DEK as a CryptoKey
  const key = await crypto.subtle.importKey(
    "raw",
    dekData.getBytes(),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  // Encrypt
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
 * Generates random bytes using Scriptable's Data API.
 */
function generateRandomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Data.fromBytes(Array.from(bytes));
}

// ─── API Communication ──────────────────────────────────────────────────────

/**
 * Posts an encrypted transaction to the CardPulse API.
 *
 * Returns true on success, false on failure.
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
      return true;
    }

    if (req.response.statusCode === 401) {
      notify(
        "CardPulse Auth Expired",
        "Your token has expired. Please run setup again."
      );
      return false;
    }

    console.error(
      `API error ${req.response.statusCode}: ${JSON.stringify(response)}`
    );
    return false;
  } catch (error) {
    console.error(`Network error: ${error.message}`);
    notify(
      "CardPulse Error",
      "Failed to send transaction. Check your connection."
    );
    return false;
  }
}

// ─── Deduplication ──────────────────────────────────────────────────────────

/**
 * Checks if the same SMS was already processed within the dedup window.
 */
function isDuplicate(smsBody) {
  const recent = loadRecentMessages();
  const now = Date.now();
  const windowMs = CONFIG.deduplicationWindowSecs * 1000;

  // Simple hash of the SMS body for comparison
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
    hash |= 0; // Convert to 32-bit integer
  }
  return hash.toString();
}

// ─── Setup ──────────────────────────────────────────────────────────────────

/**
 * Interactive setup flow — stores API credentials in the iOS Keychain.
 */
async function runSetup() {
  const alert = new Alert();
  alert.title = "CardPulse Setup";
  alert.message =
    "Enter your CardPulse API credentials.\n\n" +
    "These will be stored securely in the iOS Keychain.";

  alert.addTextField("API Base URL", CONFIG.apiBaseUrl);
  alert.addTextField("Email");
  alert.addSecureTextField("Password");
  alert.addTextField("Default Card ID (UUID)");
  alert.addAction("Login & Save");
  alert.addCancelAction("Cancel");

  const idx = await alert.presentAlert();
  if (idx === -1) return;

  const baseUrl = alert.textFieldValue(0).trim();
  const email = alert.textFieldValue(1).trim();
  const password = alert.textFieldValue(2);
  const cardId = alert.textFieldValue(3).trim();

  // Login to get token and DEK
  const loginReq = new Request(`${baseUrl}/auth/login`);
  loginReq.method = "POST";
  loginReq.headers = { "Content-Type": "application/json" };
  loginReq.body = JSON.stringify({ email, password });

  try {
    const response = await loginReq.loadJSON();

    if (loginReq.response.statusCode !== 200) {
      notify("CardPulse Setup Failed", "Invalid credentials.");
      return;
    }

    // Store credentials in Keychain
    Keychain.set(CONFIG.keychainTokenKey, response.data.token);
    Keychain.set(CONFIG.keychainCardIdKey, cardId);

    // Note: The DEK must be derived client-side from the master password
    // and the wrapped_dek returned by the server. This step requires the
    // user to enter their master password separately.
    // For now, store wrapped_dek info for the dashboard to handle DEK setup.

    notify(
      "CardPulse Setup Complete",
      "Credentials saved. SMS capture is ready.\n\n" +
        "Note: You must configure your DEK separately using the dashboard."
    );

    console.log("Setup complete. Token and card ID stored in Keychain.");
  } catch (error) {
    notify("CardPulse Setup Error", `Login failed: ${error.message}`);
  }
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
