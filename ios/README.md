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
- Your default card's UUID (from the API or dashboard)

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
4. Fill in:
   - **API Base URL** — e.g., `https://cardpulse-api.fly.dev`
   - **Email** — your CardPulse account email
   - **Password** — your CardPulse account password
   - **Default Card ID** — the UUID of the card to associate transactions with
5. Tap **Login & Save**

The script will authenticate with the API and store your JWT token and card ID
securely in the iOS Keychain.

> **Note:** You must also configure your DEK (Data Encryption Key) via the
> dashboard or manually store it in the Keychain under the key
> `cardpulse_dek` as a base64-encoded 256-bit key.

## Step 3 — Create the iOS Shortcut

### 3a — Create the Automation Trigger

1. Open the **Shortcuts** app
2. Go to the **Automation** tab
3. Tap **+** → **Create Personal Automation**
4. Select **Message**
5. Configure:
   - **Sender**: Enter your bank's SMS sender name/number (e.g., `Bradesco`, `29229`)
   - **Message Contains**: (optional) add a keyword like `Compra aprovada` to filter
6. Tap **Next**

### 3b — Add the Scriptable Action

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

## Step 4 — Test

1. Ask someone to send you a test SMS matching your bank's format, or use
   a message forwarding app
2. Check the Scriptable console log for output
3. Verify the transaction appears in the API:
   ```bash
   curl -H "Authorization: Bearer <token>" \
        https://cardpulse-api.fly.dev/v1/transactions
   ```

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

If the SMS doesn't match any known bank format, the script logs a message
and exits. No data is sent to the API. New bank formats can be added by
creating a parser function and appending it to the `PARSERS` array in
`CardPulse.js`.

### Expired JWT Token

If the API returns 401, the script shows a notification asking the user to
re-run setup. A future improvement could add automatic token refresh.

### Network Errors

If the device is offline, the script logs the error and shows a notification.
The transaction is not recorded. A future improvement could add offline
queuing.

## Supported Bank Formats

### Bradesco

```
Compra aprovada no seu PERSON BLACK PONTOS final *** -
MERCADO EXTRA-1005 valor R$ 35,94 em 15/03, as 13h19.
```

Parsed fields:
- **Merchant:** `MERCADO EXTRA-1005`
- **Amount:** `35.94`
- **Currency:** `BRL`
- **Date:** `2025-03-15`
- **Time:** `13:19`

### Generic Brazilian

Any SMS containing `R$ XX,XX` with an optional date in `DD/MM` format.
Falls back to "Unknown" merchant if no pattern matches.

## Adding New Bank Formats

1. Create a new parser function in `CardPulse.js`:

```javascript
function parseMyBank(sms) {
  const pattern = /your regex here/i;
  const match = sms.match(pattern);
  if (!match) return null;

  return {
    merchant: match[1].trim(),
    amount: parseAmount(match[2]),
    currency: "BRL",
    date: normalizeDate(match[3]),
    time: null,
  };
}
```

2. Add it to the `PARSERS` array:

```javascript
const PARSERS = [parseBradesco, parseMyBank, parseGenericBrazilian];
```

> **Important:** Place specific parsers before generic ones. The first
> matching parser wins.

## Security Notes

- The JWT token and DEK are stored in the **iOS Keychain**, which is
  encrypted at rest and protected by the device passcode / Face ID
- All encryption happens on-device — the API only receives ciphertext
- The Scriptable script runs in a sandboxed environment
- No plaintext financial data ever leaves the device
