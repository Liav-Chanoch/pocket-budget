/**
 * receiptService.js — all Gemini AI logic lives here.
 * To swap AI providers in the future, only change this file.
 *
 * Get your API key at: https://aistudio.google.com/apikey
 * Set it in .env as:   REACT_APP_GEMINI_API_KEY=your_key_here
 */

const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.REACT_APP_GEMINI_API_KEY}`;

// Word overrides: always applied when translating to English.
// Key = word as it appears on receipt, Value = what it should become.
const WORD_OVERRIDES = {
  'הפוך': 'Cappuccino',
  'קורטאדו': 'Cortado',
  'טבעוני': 'Vegan',
};

/**
 * Scans a receipt image and returns extracted items.
 *
 * @param {string}  imageBase64   - Receipt image as base64 string (no data: prefix)
 * @param {string}  mimeType      - Image MIME type, e.g. "image/jpeg"
 * @param {Array}   quicklistItems - Array of { id, text } from the current quicklist
 * @param {boolean} translate     - true = translate names to English, false = keep original language
 * @returns {Promise<{ items: Array, storeName: string|null, total: number|null }>}
 */
export async function scanReceipt(imageBase64, mimeType = 'image/jpeg', quicklistItems = [], translate = true) {
  const translationRule = translate
    ? `- Translate all product names to English\n- Word overrides (apply before translating, these take priority): ${JSON.stringify(WORD_OVERRIDES)}`
    : `- Keep all product names in their original language — do NOT translate them`;

  const prompt = `You are a receipt parser. Extract all purchased products from this receipt image.

Rules:
- Ignore: VAT lines, Pfand (bottle deposit charge), subtotals, grand totals, loyalty points, store name header lines, date lines — do NOT include any of these as items
- Leergut / bottle return credits (Leergutentleerung, Leergut Entl., Leergut Einw.): extract each as a separate item with its negative price (e.g. -0.64), name "Bottle return credit", category "other", quantity 1, itemDiscount 0
- Extract ONLY actual products that have a price
- Quantities: if a line shows a multiplier (e.g. "3 ×", "3x", "qty 3", or a count before a unit price), set quantity to that number and unitPrice to the per-unit price. Otherwise quantity = 1 and unitPrice = line price.
- Per-item discounts: if a line with a leading "-" (or the word "discount") appears directly below a product line and belongs to that product, capture it as itemDiscount (positive number — e.g. "-5.00" → itemDiscount: 5). Ignore store-wide discount summary lines.
- price (line total) = (unitPrice × quantity) - itemDiscount  — always compute this yourself
${translationRule}
- Assign a category to each item from this exact list: food, groceries, transport, activities, shopping, accommodation, beauty, other
- If quicklist items are provided below, check if any receipt item matches a quicklist item by meaning — match across languages AND tolerate typos/abbreviations (e.g. German "Tomaten", English "Tomatoes", Hebrew "עגבניה" are the same; "מלפון" is a typo of "מלפפון" which is cucumber; "Gurke"/"Cucumbers"/"מלפפון"/"מלפון" are all the same). Return the matching quicklist item id if found, or null if no match.
- Also extract: store name (if visible), the total amount (the final total paid, after ALL discounts), the currency used on the receipt (look for symbols: ₪→ILS, €→EUR, $→USD, £→GBP, or text like "NIS"→ILS; return as 3-letter code), and the receipt date (format: YYYY-MM-DD; return null if not visible or ambiguous).

Quicklist items: ${JSON.stringify(quicklistItems.map(i => ({ id: i.id, text: i.text })))}

Return ONLY a valid JSON object, no markdown, no explanation:
{
  "storeName": "store name or null",
  "total": 56.00,
  "currency": "ILS",
  "receiptDate": "2025-06-18",
  "items": [
    {
      "name": "product name",
      "quantity": 3,
      "unitPrice": 16.00,
      "itemDiscount": 0,
      "price": 48.00,
      "category": "food",
      "quicklistMatchId": "abc123 or null"
    }
  ]
}`;

  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: imageBase64 } }
      ]
    }],
    generationConfig: { temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } }
  };

  let response;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error('NETWORK_ERROR');
    }
    if (response.ok) break;
    const retryable = response.status === 503 || response.status === 429;
    if (!retryable || attempt === 1) throw new Error(`API_ERROR:${response.status}`);
    await new Promise(r => setTimeout(r, 1200));
  }

  const data = await response.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('PARSE_ERROR');
  }

  const sanitizeId = (v) => (v && v !== 'null' && v !== 'undefined') ? v : null;
  return {
    storeName:   parsed.storeName || null,
    total:       typeof parsed.total === 'number' ? parsed.total : null,
    currency:    typeof parsed.currency === 'string' ? parsed.currency.toUpperCase() : null,
    receiptDate: typeof parsed.receiptDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.receiptDate) ? parsed.receiptDate : null,
    items:       Array.isArray(parsed.items)
      ? parsed.items.map(it => ({ ...it, quicklistMatchId: sanitizeId(it.quicklistMatchId) }))
      : [],
  };
}

const COUNTRY_NAMES = { de: 'Germany', il: 'Israel', fr: 'France', es: 'Spain', gb: 'UK', us: 'USA' };
const COUNTRY_CURRENCIES = { de: 'EUR', il: 'ILS', fr: 'EUR', es: 'EUR', gb: 'GBP', us: 'USD' };

/**
 * Ask Gemini for a typical retail price for any item in a given country.
 * Returns the price in the country's local currency, or null if unknown.
 * Callers are responsible for caching — this always makes a network call.
 */
export async function fetchGeminiPriceEstimate(itemName, countryCode) {
  const country  = COUNTRY_NAMES[countryCode]     || countryCode;
  const currency = COUNTRY_CURRENCIES[countryCode] || 'EUR';
  const prompt   = `What is the typical retail price for "${itemName}" in ${country}? Answer in ${currency}. Return ONLY valid JSON with no markdown: {"price": 12.99} — or {"price": null} if you cannot estimate.`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } },
  };

  try {
    const res = await fetch(GEMINI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return null;
    const data    = await res.json();
    const raw     = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const parsed  = JSON.parse(cleaned);
    return typeof parsed.price === 'number' ? parsed.price : null;
  } catch {
    return null;
  }
}

// ─── TO REVERT NEARBY SHOPS: remove this function ────────────────────────────
/**
 * Groups a list of shopping items by the type of store that sells them.
 * Items may be in any language. Returns { groups, unmatched } or null on error.
 */
export async function categorizeItemsByStore(items) {
  const texts = items.map(i => (typeof i === 'string' ? i : i.text) || '').filter(Boolean);
  if (!texts.length) return { groups: [], unmatched: [] };

  const prompt = `You are a shopping assistant. Group these shopping list items by the type of store that sells them.

Items (may be in any language — Hebrew, German, English, etc.): ${JSON.stringify(texts)}

Rules:
- Match across languages ("עגבניה"=tomato→supermarket, "Gurke"=cucumber→supermarket, "לחם"=bread→bakery/supermarket, "מלפון"/"מלפפון"=cucumber)
- storeType: short English label 1-2 words — keep it general, not specific (e.g. "Supermarket", "Pharmacy", "Bakery", "Electronics", "Pet store", "Hardware store", "Clothing store" — never split by sub-type like "Shoe store", "Hat store", etc.; group all clothing/footwear/accessories → "Clothing store")
- searchQuery: best Google Maps search term for nearby stores of this type (e.g. "grocery store", "pharmacy", "bakery")
- emoji: one fitting emoji for the store type
- items: the EXACT item strings from the input that belong to this store type (copy them verbatim)
- unmatched: items that don't clearly fit any store type

Return ONLY valid JSON, no markdown:
{
  "groups": [
    { "storeType": "Supermarket", "searchQuery": "grocery store", "emoji": "🛒", "items": ["item text..."] }
  ],
  "unmatched": []
}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } },
  };
  try {
    const res = await fetch(GEMINI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    return JSON.parse(cleaned);
  } catch { return null; }
}
// ─────────────────────────────────────────────────────────────────────────────
