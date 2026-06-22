// Fallback rates (used until live fetch completes).
const RATES_TO_EUR = { eur: 1.0, ils: 0.26, gbp: 1.16, usd: 0.93 };
const COUNTRY_CURRENCY  = { de: 'eur', il: 'ils', fr: 'eur', es: 'eur', gb: 'gbp', us: 'usd' };
const SYMBOL_TO_CURRENCY = { '€': 'eur', '₪': 'ils', '£': 'gbp', '$': 'usd' };

// Fetch live rates from open.er-api.com (free, no key, EUR-based).
// Called once on app start; silently keeps fallbacks on failure.
export async function fetchLiveRates() {
  try {
    const res  = await fetch('https://open.er-api.com/v6/latest/EUR', { cache: 'no-store' });
    const data = await res.json();
    if (data.result !== 'success') return;
    for (const [code, rateVsEur] of Object.entries(data.rates)) {
      const key = code.toLowerCase();
      if (key in RATES_TO_EUR) RATES_TO_EUR[key] = 1 / rateVsEur;
    }
  } catch {}
}

// Map from app currency codes (group.currency values) to RATES_TO_EUR keys
const CURRENCY_CODE_MAP = { EUR: 'eur', ILS: 'ils', GBP: 'gbp', USD: 'usd' };

// Convert an amount between two currency codes (e.g. 'EUR' → 'ILS').
// Falls back gracefully: if either currency is unknown, returns the original amount.
export function convertAmount(amount, fromCurrency, toCurrency) {
  if (!amount || fromCurrency === toCurrency) return amount;
  const from = CURRENCY_CODE_MAP[fromCurrency];
  const to   = CURRENCY_CODE_MAP[toCurrency];
  if (!from || !to) return amount;
  // Convert via EUR as base
  return amount * RATES_TO_EUR[from] / RATES_TO_EUR[to];
}

export function toDisplayCurrency(price, fromCountryCode, displaySymbol) {
  if (!price) return price;
  const from = COUNTRY_CURRENCY[fromCountryCode] || 'eur';
  const to   = SYMBOL_TO_CURRENCY[displaySymbol]  || 'eur';
  if (from === to) return price;
  return price * RATES_TO_EUR[from] / RATES_TO_EUR[to];
}

// Typical supermarket prices per country (local currency).
// de=EUR, il=ILS, fr=EUR, es=EUR, gb=GBP, us=USD
// Each entry: [keywords], prices object
// Used for cart estimation in ShoppingListTab.

export const PRICE_DB = [
  // ── Dairy & Eggs ──
  { k: ['milk', 'חלב'],                         de:1.10, il:6,   fr:1.00, es:0.90, gb:1.10, us:4.00 },
  { k: ['eggs', 'egg', 'ביצים', 'ביצה'],         de:2.50, il:12,  fr:2.20, es:2.00, gb:2.50, us:5.00 },
  { k: ['butter', 'חמאה'],                       de:2.20, il:15,  fr:2.50, es:1.80, gb:1.80, us:4.50 },
  { k: ['cheese', 'גבינה'],                      de:3.00, il:18,  fr:4.00, es:2.50, gb:3.00, us:5.00 },
  { k: ['yogurt', 'יוגורט'],                     de:0.80, il:5,   fr:0.90, es:0.70, gb:0.80, us:1.50 },
  { k: ['cream', 'שמנת'],                        de:1.00, il:8,   fr:1.10, es:0.90, gb:1.00, us:2.00 },
  { k: ['sour cream', 'שמנת חמוצה'],             de:0.90, il:7,   fr:1.00, es:0.80, gb:0.90, us:2.00 },
  { k: ['cottage', 'קוטג'],                      de:1.50, il:8,   fr:1.50, es:1.20, gb:1.30, us:3.50 },

  // ── Bakery ──
  { k: ['bread', 'לחם'],                         de:1.50, il:8,   fr:1.80, es:1.20, gb:1.20, us:3.50 },
  { k: ['roll', 'rolls', 'bun', 'buns', 'לחמנייה'],de:0.20,il:2,  fr:0.30, es:0.20, gb:0.25, us:0.50 },
  { k: ['pita', 'פיתה'],                         de:1.20, il:5,   fr:1.20, es:1.00, gb:1.20, us:3.00 },
  { k: ['croissant', 'קרואסון'],                 de:0.90, il:6,   fr:1.10, es:0.80, gb:0.90, us:2.50 },
  { k: ['flour', 'קמח'],                         de:0.80, il:5,   fr:0.90, es:0.70, gb:0.90, us:3.00 },
  { k: ['yeast', 'שמרים'],                       de:0.50, il:3,   fr:0.50, es:0.40, gb:0.50, us:1.00 },

  // ── Dry goods & Pantry ──
  { k: ['pasta', 'פסטה', 'noodles', 'אטריות'],   de:1.00, il:8,   fr:1.20, es:0.80, gb:1.00, us:2.00 },
  { k: ['rice', 'אורז'],                         de:1.50, il:8,   fr:1.50, es:1.20, gb:1.20, us:2.50 },
  { k: ['oats', 'oatmeal', 'שיבולת שועל'],       de:1.50, il:10,  fr:1.50, es:1.20, gb:1.20, us:4.00 },
  { k: ['cereal', 'דגני בוקר'],                  de:3.00, il:20,  fr:3.00, es:2.50, gb:2.80, us:5.00 },
  { k: ['sugar', 'סוכר'],                        de:1.00, il:6,   fr:1.00, es:0.80, gb:1.00, us:2.50 },
  { k: ['salt', 'מלח'],                          de:0.50, il:3,   fr:0.50, es:0.40, gb:0.50, us:1.00 },
  { k: ['olive oil', 'שמן זית'],                 de:5.00, il:30,  fr:5.00, es:3.00, gb:5.00, us:8.00 },
  { k: ['oil', 'שמן'],                           de:2.00, il:12,  fr:2.00, es:1.50, gb:2.00, us:4.00 },
  { k: ['tomato sauce', 'pasta sauce', 'רסק עגבניות'], de:1.50, il:8, fr:1.50, es:1.20, gb:1.50, us:3.00 },
  { k: ['canned tomatoes', 'עגבניות משומרות'],    de:0.80, il:5,   fr:0.90, es:0.70, gb:0.80, us:1.50 },
  { k: ['tuna', 'טונה'],                         de:1.50, il:8,   fr:1.50, es:1.20, gb:1.20, us:2.00 },
  { k: ['peas', 'אפונה'],                         de:1.50, il:8,   fr:1.50, es:1.20, gb:1.20, us:2.50 },
  { k: ['beans', 'שעועית'],                      de:1.00, il:6,   fr:1.00, es:0.80, gb:1.00, us:1.50 },
  { k: ['lentils', 'עדשים'],                     de:1.50, il:8,   fr:1.50, es:1.20, gb:1.20, us:2.50 },
  { k: ['chickpeas', 'חומוס'],                   de:1.50, il:6,   fr:1.50, es:1.20, gb:1.20, us:2.00 },

  // ── Condiments ──
  { k: ['ketchup', 'קטשופ'],                     de:1.80, il:10,  fr:2.00, es:1.50, gb:1.50, us:3.50 },
  { k: ['mustard', 'חרדל'],                      de:1.20, il:8,   fr:1.50, es:1.00, gb:1.20, us:3.00 },
  { k: ['mayonnaise', 'mayo', 'מיונז'],           de:1.80, il:10,  fr:2.00, es:1.50, gb:1.50, us:3.50 },
  { k: ['honey', 'דבש'],                         de:3.00, il:20,  fr:3.50, es:3.00, gb:3.00, us:6.00 },
  { k: ['jam', 'jelly', 'ריבה'],                 de:2.00, il:12,  fr:2.00, es:1.80, gb:2.00, us:4.00 },
  { k: ['hummus', 'חומוס מוכן'],                  de:2.50, il:8,   fr:2.50, es:2.00, gb:2.00, us:4.00 },

  // ── Drinks ──
  { k: ['water', 'מים'],                         de:0.50, il:3,   fr:0.50, es:0.40, gb:0.60, us:1.50 },
  { k: ['juice', 'מיץ'],                         de:1.50, il:12,  fr:1.50, es:1.20, gb:1.50, us:3.50 },
  { k: ['beer', 'בירה'],                         de:0.90, il:8,   fr:1.00, es:0.80, gb:1.20, us:2.00 },
  { k: ['wine', 'יין'],                          de:5.00, il:40,  fr:5.00, es:4.00, gb:6.00, us:12.00 },
  { k: ['coffee', 'קפה'],                        de:4.00, il:30,  fr:5.00, es:3.50, gb:4.00, us:8.00 },
  { k: ['tea', 'תה'],                            de:2.50, il:15,  fr:3.00, es:2.50, gb:2.00, us:5.00 },
  { k: ['soda', 'cola', 'coke', 'pepsi', 'sprite', 'קולה'],de:1.20,il:8,fr:1.20,es:1.00,gb:1.20,us:2.00 },
  { k: ['energy drink', 'red bull', 'monster'],  de:1.80, il:12,  fr:2.00, es:1.80, gb:1.80, us:3.50 },

  // ── Produce ──
  { k: ['tomato', 'tomatoes', 'עגבנייה', 'עגבניות'], de:2.00, il:8,fr:2.00,es:1.50,gb:2.50,us:3.00 },
  { k: ['potato', 'potatoes', 'תפוח אדמה', 'תפוחי אדמה'], de:1.50,il:6,fr:1.50,es:1.00,gb:1.50,us:3.00 },
  { k: ['onion', 'onions', 'בצל'],               de:1.00, il:5,   fr:1.00, es:0.80, gb:1.00, us:2.00 },
  { k: ['garlic', 'שום'],                        de:1.50, il:8,   fr:1.50, es:1.00, gb:1.50, us:2.50 },
  { k: ['carrot', 'carrots', 'גזר'],             de:1.00, il:5,   fr:1.00, es:0.80, gb:1.00, us:2.00 },
  { k: ['cucumber', 'מלפפון'],                   de:0.50, il:4,   fr:0.60, es:0.50, gb:0.60, us:1.50 },
  { k: ['pepper', 'peppers', 'פלפל'],            de:1.50, il:8,   fr:1.50, es:1.00, gb:1.50, us:2.50 },
  { k: ['lettuce', 'חסה'],                       de:1.00, il:6,   fr:1.00, es:0.80, gb:1.00, us:2.50 },
  { k: ['spinach', 'תרד'],                       de:1.50, il:8,   fr:1.50, es:1.20, gb:1.50, us:3.00 },
  { k: ['broccoli', 'ברוקולי'],                  de:1.50, il:8,   fr:1.50, es:1.20, gb:1.50, us:3.00 },
  { k: ['mushroom', 'mushrooms', 'פטרייה', 'פטריות'], de:2.00,il:12,fr:2.00,es:1.80,gb:2.00,us:3.50 },
  { k: ['apple', 'apples', 'תפוח', 'תפוחים'],   de:2.00, il:10,  fr:2.00, es:1.50, gb:2.00, us:4.00 },
  { k: ['banana', 'bananas', 'בננה', 'בננות'],   de:1.50, il:7,   fr:1.50, es:1.20, gb:1.20, us:2.00 },
  { k: ['orange', 'oranges', 'תפוז', 'תפוזים'],  de:2.00, il:8,   fr:2.00, es:1.50, gb:2.00, us:3.50 },
  { k: ['lemon', 'lemons', 'לימון'],             de:0.50, il:3,   fr:0.50, es:0.30, gb:0.50, us:1.00 },
  { k: ['avocado', 'אבוקדו'],                    de:1.20, il:5,   fr:1.50, es:1.00, gb:1.20, us:2.00 },
  { k: ['strawberry', 'strawberries', 'תות', 'תותים'], de:2.50,il:18,fr:2.50,es:2.00,gb:2.50,us:4.00 },
  { k: ['grapes', 'ענבים'],                      de:2.50, il:12,  fr:2.50, es:2.00, gb:2.50, us:4.00 },

  // ── Meat & Fish ──
  { k: ['chicken', 'עוף'],                       de:7.00, il:35,  fr:7.00, es:5.00, gb:6.00, us:8.00 },
  { k: ['beef', 'בקר', 'בשר בקר'],              de:12.00,il:65,  fr:12.00,es:10.00,gb:10.00,us:12.00 },
  { k: ['ground beef', 'minced meat', 'בשר טחון'], de:5.00,il:40,fr:6.00,es:5.00,gb:5.00,us:6.00 },
  { k: ['salmon', 'סלמון'],                      de:15.00,il:80,  fr:18.00,es:12.00,gb:14.00,us:20.00 },
  { k: ['fish', 'דג', 'דגים'],                   de:8.00, il:40,  fr:8.00, es:6.00, gb:7.00, us:10.00 },
  { k: ['shrimp', 'prawns', 'שרימפס'],           de:10.00,il:60,  fr:12.00,es:8.00, gb:9.00, us:14.00 },
  { k: ['sausage', 'sausages', 'נקניק'],         de:3.00, il:20,  fr:3.50, es:3.00, gb:3.00, us:5.00 },
  { k: ['turkey', 'הודו'],                       de:6.00, il:30,  fr:6.00, es:5.00, gb:5.00, us:7.00 },

  // ── Frozen ──
  { k: ['frozen pizza', 'פיצה קפואה'],           de:3.00, il:25,  fr:3.00, es:2.50, gb:3.00, us:6.00 },
  { k: ['ice cream', 'גלידה'],                   de:3.00, il:20,  fr:3.00, es:2.50, gb:3.00, us:5.00 },

  // ── Snacks ──
  { k: ['chips', 'crisps', 'צ\'יפס', 'חטיף'],   de:1.50, il:10,  fr:1.50, es:1.20, gb:1.50, us:3.00 },
  { k: ['chocolate', 'שוקולד'],                  de:2.00, il:12,  fr:2.00, es:1.80, gb:2.00, us:3.50 },
  { k: ['biscuits', 'cookies', 'עוגיות', 'ביסקוויטים'], de:1.50,il:10,fr:1.80,es:1.50,gb:1.50,us:3.00 },
  { k: ['popcorn', 'פופקורן'],                   de:1.50, il:10,  fr:1.50, es:1.20, gb:1.50, us:3.00 },
  { k: ['nuts', 'אגוזים'],                       de:3.00, il:20,  fr:3.00, es:2.50, gb:3.00, us:6.00 },

  // ── Hygiene & Household ──
  { k: ['shampoo', 'שמפו'],                      de:3.00, il:20,  fr:3.00, es:2.50, gb:3.00, us:6.00 },
  { k: ['conditioner', 'מרכך שיער'],             de:3.00, il:20,  fr:3.00, es:2.50, gb:3.00, us:6.00 },
  { k: ['soap', 'סבון'],                         de:1.00, il:8,   fr:1.00, es:0.80, gb:1.00, us:2.00 },
  { k: ['toothpaste', 'משחת שיניים'],            de:2.00, il:15,  fr:2.00, es:1.80, gb:2.00, us:4.00 },
  { k: ['toothbrush', 'מברשת שיניים'],           de:2.00, il:15,  fr:2.00, es:1.50, gb:2.00, us:4.00 },
  { k: ['deodorant', 'דאודורנט'],                de:2.50, il:18,  fr:2.50, es:2.00, gb:2.50, us:5.00 },
  { k: ['toilet paper', 'נייר טואלט'],           de:2.00, il:15,  fr:2.00, es:1.80, gb:2.00, us:5.00 },
  { k: ['tissues', 'מגבונים', 'טישו'],           de:1.50, il:10,  fr:1.50, es:1.20, gb:1.50, us:3.00 },
  { k: ['detergent', 'אבקת כביסה', 'washing powder'], de:5.00,il:30,fr:5.00,es:4.00,gb:5.00,us:8.00 },
  { k: ['dish soap', 'ממי', 'נוזל כלים'],        de:1.50, il:10,  fr:1.50, es:1.20, gb:1.50, us:3.00 },
  { k: ['sponge', 'ספוג'],                       de:1.00, il:6,   fr:1.00, es:0.80, gb:1.00, us:2.00 },
  { k: ['trash bags', 'שקיות אשפה'],             de:2.00, il:15,  fr:2.00, es:1.80, gb:2.00, us:4.00 },
  { k: ['foil', 'נייר כסף', 'aluminum foil'],    de:2.00, il:12,  fr:2.00, es:1.80, gb:2.00, us:4.00 },
];

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

export function estimatePrice(itemName, countryCode) {
  const query = itemName.toLowerCase().trim();
  const cc = countryCode || 'de';

  // Build a flat list of (keyword, price) sorted longest keyword first so
  // "שמנת חמוצה" (sour cream) beats "גבינה" (cheese) when both appear in the query.
  const candidates = [];
  for (const row of PRICE_DB) {
    for (const kw of row.k) {
      candidates.push({ kw: kw.toLowerCase(), price: row[cc] ?? null });
    }
  }
  candidates.sort((a, b) => b.kw.length - a.kw.length);

  // Pass 1: substring match (longer keywords checked first)
  for (const { kw, price } of candidates) {
    if (query === kw || query.includes(kw) || kw.includes(query)) {
      return price;
    }
  }

  // Pass 2: token overlap (any keyword token found in query tokens)
  const queryTokens = query.split(/[\s,]+/);
  for (const { kw, price } of candidates) {
    const kwTokens = kw.split(/[\s,]+/);
    if (kwTokens.some(t => queryTokens.includes(t) || queryTokens.some(qt => qt.length > 3 && kw.includes(qt)))) {
      return price;
    }
  }

  // Pass 3: fuzzy — allow 1 typo per word (edit distance ≤ 1 for short words, ≤ 2 for longer)
  for (const qt of queryTokens) {
    if (qt.length < 3) continue;
    const maxDist = qt.length <= 5 ? 1 : 2;
    for (const { kw, price } of candidates) {
      for (const kwt of kw.split(/[\s,]+/)) {
        if (Math.abs(kwt.length - qt.length) <= maxDist && levenshtein(qt, kwt) <= maxDist) {
          return price;
        }
      }
    }
  }

  return null;
}
