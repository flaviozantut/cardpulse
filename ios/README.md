# iOS SMS Capture — Setup Guide

This guide walks through setting up the iOS automation that captures bank SMS
notifications and sends encrypted transaction data to the CardPulse API.

## Overview

```
Bank SMS → iOS Shortcut (trigger) → Scriptable (parse + encrypt) → CardPulse API
```

The automation runs entirely on-device. The SMS text is parsed and encrypted
with AES-256-GCM before leaving the phone — the server never sees plaintext
transaction data.

## Requirements

- iPhone with **iOS 16+**
- [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) app (free)
- iOS **Shortcuts** app (built-in)
- A registered CardPulse account with at least one card created

## Step 1 — Install the Scriptable Script

1. Open the **Scriptable** app on your iPhone
2. Tap **+** to create a new script
3. Name it `CardPulse`
4. Copy the contents of [`scriptable/CardPulse.js`](scriptable/CardPulse.js) into the script editor
5. Update the `CONFIG.apiBaseUrl` value if your API is hosted at a different URL
6. Save the script

## Step 2 — Run Initial Setup

1. Open the **Scriptable** app
2. Tap the `CardPulse` script
3. When prompted for input, type `setup` (or run it from Shortcuts with the `setup` argument)
4. **Step 1/2 — API Credentials:**
   - **API Base URL** — e.g., `https://cardpulse-api.fly.dev`
   - **Email** — your CardPulse account email
   - **Password** — your CardPulse account password
5. **Step 2/2 — Master Password:**
   - Enter your **master password** (the one used in the dashboard for encryption, NOT the API login password)
   - The script derives the DEK from your master password using PBKDF2 and the wrapped DEK returned by the server
6. Tap **Derive & Save**

The script stores the following in the iOS Keychain (protected by device passcode / Face ID):
- JWT token for API authentication
- DEK (Data Encryption Key) for encrypting transaction data

## Step 3 — Configure Card Mapping

The script can automatically route transactions to the correct card based on
the last digits extracted from the SMS.

1. Run the script with argument `cards`
2. Enter the **last 4 digits** of your card and its **UUID** from the API
3. Optionally set a **default card UUID** as a fallback
4. Repeat for each card you want to map

Example mapping:
```
...1234 → a1b2c3d4-...  (Bradesco Visa)
...5678 → e5f6g7h8-...  (Nubank Mastercard)
Default → a1b2c3d4-...  (fallback for unrecognized digits)
```

When the script parses an SMS and extracts `final 1234`, it looks up `1234`
in the card mapping. If no match is found, it falls back to the default card.

## Step 4 — Create the iOS Shortcut

### 4a — Create the Automation Trigger

1. Open the **Shortcuts** app
2. Go to the **Automation** tab
3. Tap **+** → **Create Personal Automation**
4. Select **Message**
5. Configure:
   - **Sender**: Enter your bank's SMS sender name/number (e.g., `Bradesco`, `29229`)
   - **Message Contains**: (optional) add a keyword like `Compra aprovada` to filter
6. Tap **Next**

### 4b — Add the Scriptable Action

1. Tap **Add Action**
2. Search for **Scriptable** → select **Run Script**
3. Configure:
   - **Script**: `CardPulse`
   - **Text**: Tap and select **Shortcut Input** (this passes the SMS body)
4. Tap **Next**
5. **Turn OFF** "Ask Before Running" for fully automatic operation
6. Tap **Done**

### Shortcut Summary

```
Trigger:  Message from [your bank sender]
          containing "Compra aprovada" (optional filter)

Action:   Run Scriptable script "CardPulse"
          with input: Shortcut Input (message body)

Settings: Ask Before Running = OFF
```

## Step 5 — Test

1. Ask someone to send you a test SMS matching your bank's format, or use
   a message forwarding app
2. Check the Scriptable console log for output
3. Verify the transaction appears in the API:
   ```bash
   curl -H "Authorization: Bearer <token>" \
        https://cardpulse-api.fly.dev/v1/transactions
   ```

## Parsed Fields

The script extracts the following fields from each SMS:

| Field | Description | Example |
|-------|-------------|---------|
| `card_name` | Card product name from the SMS | `PERSON BLACK PONTOS` |
| `last_digits` | Last 3-4 digits of the card | `1234` |
| `merchant` | Merchant name | `MERCADO EXTRA-1005` |
| `amount` | Transaction amount (decimal string) | `35.94` |
| `currency` | Currency code | `BRL` |
| `date` | Transaction date (ISO format) | `2025-03-15` |
| `time` | Transaction time (if available) | `13:19` |

All fields are encrypted together as a single JSON blob before being sent to
the API. The `timestamp_bucket` (YYYY-MM) is computed from the date and sent
as plaintext metadata for server-side filtering.

## Edge Cases

### Duplicate SMS

iOS may deliver the same SMS notification multiple times (e.g., from
notification center replay, or carrier retransmission). The script includes
a **deduplication window** (default: 30 seconds) that ignores identical
messages received within that period. This is controlled by
`CONFIG.deduplicationWindowSecs`.

### Empty SMS Body

If the Shortcut passes an empty or null body (e.g., MMS with no text, or a
system message), the script exits silently without making any API call.

### Unrecognized SMS Format

If the SMS doesn't match any known bank format, the script shows a
**notification** alerting the user and logs the raw SMS to the console for
debugging.

### Expired JWT Token

If the API returns 401, the script shows a notification asking the user to
re-run setup. The error is treated as permanent and not retried.

### Network Errors

On network failure, the script **retries up to 3 times** with exponential
backoff (2s, 4s, 8s). If all retries fail, a notification is shown. The
retry configuration is in `CONFIG.maxRetries` and `CONFIG.retryDelayMs`.

### Unknown Card Digits

If the SMS contains card digits not in the card mapping, the script falls
back to the default card ID. If no default is configured, it shows a
notification asking the user to run `cards` setup.

## Supported Bank Formats

### Bradesco

```
Compra aprovada no seu PERSON BLACK PONTOS final 1234 -
MERCADO EXTRA-1005 valor R$ 35,94 em 15/03, as 13h19.
```

Parsed fields:
- **Card Name:** `PERSON BLACK PONTOS`
- **Last Digits:** `1234`
- **Merchant:** `MERCADO EXTRA-1005`
- **Amount:** `35.94`
- **Currency:** `BRL`
- **Date:** `2025-03-15`
- **Time:** `13:19`

### Generic Brazilian

Any SMS containing `R$ XX,XX` with optional `final XXXX` for card
identification and `DD/MM` for date. Falls back to "Unknown" for missing
fields.

## Adding New Bank Formats

1. Create a new parser function in `CardPulse.js`:

```javascript
function parseMyBank(sms) {
  const cardPattern = /your card regex/i;
  const cardMatch = sms.match(cardPattern);

  const txPattern = /your transaction regex/i;
  const txMatch = sms.match(txPattern);
  if (!txMatch) return null;

  return {
    card_name: cardMatch ? cardMatch[1].trim() : "Unknown",
    last_digits: cardMatch ? cardMatch[2] : "0000",
    merchant: txMatch[1].trim(),
    amount: parseAmount(txMatch[2]),
    currency: "BRL",
    date: normalizeDate(txMatch[3]),
    time: null,
  };
}
```

2. Add it to the `PARSERS` array (before the generic parser):

```javascript
const PARSERS = [parseBradesco, parseMyBank, parseGenericBrazilian];
```

> **Important:** Place specific parsers before generic ones. The first
> matching parser wins.

## Script Commands

The script accepts different arguments to control its behavior:

| Argument | Action |
|----------|--------|
| *(SMS text)* | Parse, encrypt, and POST the transaction |
| `setup` | Interactive setup — login + DEK derivation |
| `cards` | Interactive card mapping configuration |

## Security Notes

- The JWT token and DEK are stored in the **iOS Keychain**, which is
  encrypted at rest and protected by the device passcode / Face ID / Touch ID
- The DEK is derived on-device from the master password — it never leaves
  the phone in plaintext
- All encryption happens on-device using AES-256-GCM with a random 12-byte
  IV per transaction
- The Scriptable script runs in a sandboxed environment
- No plaintext financial data ever leaves the device
- The master password is used only during setup and is never stored
