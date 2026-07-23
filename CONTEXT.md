# Pocket Budget — Session Context

> Last updated: **2026-07-22**. Onboarding doc for a new Claude Code session.
> Read §0 first — it exists because ignoring it caused a production incident.

---

## 0. READ THIS BEFORE YOU DEPLOY

**The local working tree is not automatically the source of truth. Verify before every deploy.**

On 2026-07-22 a deploy overwrote production with an older design and a dead API key.
Cause: the local checkout was behind what was live. Prod was serving a build made from
source that no longer existed on this machine. Deploying "the current code" silently
reverted three days of design work and broke receipt scanning.

**Mandatory pre-deploy check** (30 seconds, run every time):

```bash
# 1. What theme is live right now?
curl -s https://pocket-budget-manager.web.app/ | grep -oE '/static/css/main\.[a-f0-9]+\.css'
# then fetch that CSS and check --color-bg-header. Expect #143c37 (deep teal).

# 2. Does the local build produce the same thing?
grep -m1 -- '--color-bg-header' src/index.css   # expect #143C37
```

If live and local disagree, **stop and investigate**. Do not deploy to "fix" it.

**Recovery method if local is behind:** CRA ships source maps to hosting
(`main.<hash>.js.map`, `main.<hash>.css.map`). They contain complete original sources
in `sourcesContent`. Any deployed build can be fully recovered:

```python
import json
m = json.load(open('main.<hash>.js.map'))
for i, s in enumerate(m['sources']):
    if '/src/' in s and 'node_modules' not in s:
        open('/tmp/' + s.split('/')[-1], 'w').write(m['sourcesContent'][i])
```

This is what recovered the design. Keep `GENERATE_SOURCEMAP` at its default (on) —
it is the de-facto backup for a repo with no remote.

**Other rules learned the hard way:**

- Never `git stash` the user's work to "clean up" before a deploy. Ask instead.
- Screenshots showing the correct UI may be a stale phone cache — not proof the deploy worked.
- Verify a deploy by fetching the live bundle and grepping it, not by trusting the CLI's success message.

---

## 1. Project Structure

```
berlin-budget/
├── .env                          # REACT_APP_GEMINI_API_KEY — NOTE: tracked in git, see §13
├── .firebaserc                   # default project = pocket-budget-manager (PROD)
├── firebase.json                 # Firestore rules + emulator + hosting (no-cache on index.html)
├── firestore.rules
├── public/
│   ├── manifest.json             # PWA manifest
│   ├── service-worker.js         # share-target + offline app-shell cache (§11)
│   └── logo-header-v4.png
└── src/
    ├── App.js                    # Auth gate → GroupSetup or Dashboard; useAutoUpdate()
    ├── AuthScreen.js
    ├── Dashboard.js              # ~4890 lines — ALL UI components live here
    ├── GroupSetup.js
    ├── LanguageContext.js        # EN/HE context
    ├── firebase.js               # init + Firestore offline persistence (§11)
    ├── firebase.dev.js           # unused duplicate, ignore
    ├── firestoreWrite.js         # queuedWrite() + newDocRef() — offline writes (§11)
    ├── i18n.js                   # ~640 lines — all strings EN + HE
    ├── index.css                 # ~1090 lines — v5 "Teal + Coral" theme (§4)
    ├── offlineToast.js           # pub/sub for "needs internet" notices
    ├── pricedb.js                # price estimation + FX conversion
    ├── receiptService.js         # Gemini: scan, price estimate, categorize
    ├── useOnline.js              # navigator.onLine hook
    └── utils.js                  # getDailyBudget, date helpers, CATEGORIES
```

---

## 2. Tech Stack

- **React 19.2.6** via Create React App (PWA)
- **Firebase SDK v12** — Firestore (`onSnapshot`), Auth (email/password), Hosting
- **No Cloud Functions** — all logic client-side, including Gemini calls
- **lucide-react** — icons only, never emoji in UI
- **Gemini 2.5 Flash** via REST (not SDK)
- Two Firebase projects:
  - `pocket-budget-manager` — **PROD** → pocket-budget-manager.web.app
  - `pocket-budget-manager-dev` — **DEV** → pocket-budget-manager-dev.web.app

---

## 3. Build / Deploy

```bash
npm start                  # local dev → LOCAL EMULATORS (auth:9099, firestore:8080)
npm run deploy:dev         # REACT_APP_ENV=dev → DEV project
npm run deploy             # → PROD project

# Rules-only (deploy BEFORE hosting whenever rules changed):
firebase deploy --only firestore:rules --project pocket-budget-manager-dev
firebase deploy --only firestore:rules --project pocket-budget-manager
```

**Deploy target:** default to PROD unless told otherwise. (An earlier version of this doc
said Home Mode must stay DEV-only. As of 2026-07-22 Home Mode code is on prod but inert —
it is gated behind `groupMode === 'home'`, and trip groups never see it. Both environments
now run the same build.)

Use `npx serve -s build -l 3001` to test a production build locally — needed for
service-worker behaviour, which does not run under `npm start`.

---

## 4. Design — v5 "Teal + Coral"

Restored 2026-07-22 from source maps after being overwritten. **These values identify the
correct build. If they don't match what's live, something is wrong.**

```
--color-primary:       #BE4B13   /* burnt-orange / coral — primary interactive */
--color-primary-light: rgba(190,75,19,0.12)
--color-bg-page:       #F9F5EC   /* warm cream */
--color-bg-card:       #FFFFFF
--color-bg-header:     #143C37   /* deep teal — the signature colour */
--color-text-main:     #14110C
--color-accent-red:    #C21725
--radius-pill:         9px       /* deliberately sharper than fully-pill */
```

Font is **Sora**. Splash-screen background in `App.js` is `#143C37` — keep in sync with
`--color-bg-header`. Header has an 18px bottom radius. `font-variant-numeric: tabular-nums`
on body.

A **blue** theme (`#2D54B8`) is the *old* design and lives in every git commit up to
`ce3abe2`. Seeing blue means an old build. All CSS vars carry inline comments naming their
design-token role — preserve them.

---

## 5. Firestore Data Model

```
/users/{uid} └── groupId

/groups/{groupId}                         ← groupId === admin's uid
  ├── adminUid, budgetMode ('daily'|'weekly'), budgetAmount
  ├── currency (symbol: '₪','€','$','£'), inviteCode
  ├── groupMode: 'trip' | 'home'          ← normalize .toLowerCase(); missing = 'trip'
  ├── savings_box_shared, shared_savings_contributors: { [uid]: number }
  ├── sharedNotes / sharedNotesUpdatedAt / sharedNotesUpdatedBy
  ├── translateReceipts: bool
  └── createdAt

  /members/{uid}
    ├── uid, displayName, email, role ('admin'|'user')
    ├── running_balance: number           ← cumulative net across days
    ├── last_day_processed: 'YYYY-MM-DD'
    ├── savings_box_personal, last_sunday_prompt
    ├── borrow_enabled: bool, borrow_percent: number   ← percent, default 100 (NOT 0.5)
    ├── avatarUrl (base64 jpeg), notes
    └── sharedNotesLastSeenAt

  /expenses/{id}
    ├── uid, addedBy, description, amount, category, date ('YYYY-MM-DD')
    ├── originalAmount, originalCurrency  ← when entered in foreign currency
    ├── quantity (only when > 1), photo (base64), createdAt

  /daily_records/{uid}_{YYYY-MM-DD}       ← note the composite doc id
    └── { uid, date, total_spent, debt, surplus, daily_budget }

  /big_expenses/{id}
    ├── totalAmount, dailyAmount, weeks, paidOff, startDate
    ├── active: bool, createdBy           ← filtered CLIENT-SIDE by createdBy===uid
  /product_catalog/{uid}/items/{id}       ← name, price, originalPrice, originalCurrency, category, photo
  /receipts/{id}                          ← storeName, total, items[], currency, imageBase64
  /shopping_list/{id}                     ← text, uid, addedBy, addedAt, quantity, claimedBy
  /named_lists/{id}/items/{id}            ← personal lists
  /other_lists/{id}                       ← named custom lists
  /price_estimates/{cacheKey}             ← Gemini price cache: {country}_{slug}
  /income/{id}                            ← HOME MODE
  /recurring_expenses/{id}                ← HOME MODE
```

`shopping_list.addedAt` uses `new Date()`, **not** `serverTimestamp()` — deliberate, so
`orderBy('addedAt')` works offline. Do not "fix" this to serverTimestamp.

---

## 6. Firestore Rules

Helpers: `isMember(groupId)`, `isAdmin(groupId)`. Rules for `income` and
`recurring_expenses` are deployed in both environments.

**WARNING:** adding subcollection rules inside `match /groups/{groupId}` once broke all
reads for all users. Always deploy rules first, confirm success, then deploy hosting.

---

## 7. Dashboard.js Component Map

Line numbers as of 2026-07-22 — they drift, grep the name instead.

| Line | Component |
|------|-----------|
| 94 | `ExpenseItem` |
| 158 | `ExpensesTab` |
| 273 / 309 | `DonutChart` / `TrendChart` |
| 343 | `StatsTab` |
| 522 | `MembersTab` |
| 643 | `ProfilePage` |
| 867 | `ScannedReceiptsPage` |
| 1037 | `SettingsTab` |
| 1327 | `ProductsTab` |
| 1547 | `ShoppingListTab` — Quick List |
| 2222 | `OtherListDetail` (duplicates much of ShoppingListTab — edit both) |
| 2534 / 2627 | `OtherListsPage` / `MyListsPage` |
| 2784 | `NotesPage` |
| 2869 | `IncomePage` — HOME MODE |
| 3050 | `RecurringExpensesPage` — HOME MODE |
| 3320 | `ReceiptReviewModal` |
| 3555 | `AvailableInfoPopup` |
| 3642 | `BigExpenseSheet` |
| 3865 | **Main `Dashboard`** — all state, effects, render tree |

`ShoppingListTab` and `OtherListDetail` contain near-identical logic (add item, buy,
delete, estimate). **A change to one almost always belongs in the other.**

---

## 8. Balance Calculation

```js
const dailyBudget    = getDailyBudget(group);         // amount, or amount/7 if weekly
const runningBalance = memberData.running_balance || 0;
const todayBalance   = runningBalance + dailyBudget - myTodayTotal - bigExpenseDailyTotal;

const borrowFraction = (memberData.borrow_enabled ?? false)
  ? (memberData.borrow_percent ?? 100) / 100          // percent-based, default 100%
  : 0;
const canStillSpend  = Math.max(0, todayBalance + dailyBudget * borrowFraction);
```

Rollover runs client-side in a `useEffect` in `Dashboard`, walking each unprocessed day
from `last_day_processed` to yesterday and writing `/daily_records`.

**Known limitation:** rollover is per-member and each client writes only its own member
doc. A shared/mutual budget (one pot for the whole group) would need a transaction plus
`last_day_processed` on the *group* doc to avoid double-counting from two phones. This was
discussed but not built — see §15.

---

## 9. Gemini (receiptService.js)

**Always** `gemini-2.5-flash`, `thinkingBudget: 0`, `temperature: 0.1` — never change.

Exports: `scanReceipt`, `fetchGeminiPriceEstimate`, `categorizeItemsByStore`.
`scanReceipt` retries once on 503/429; errors include the API's own message
(`API_ERROR:400: API key not valid…`) rather than a bare status code.

**The API key:**
- Lives in `.env` as `REACT_APP_GEMINI_API_KEY`, **baked into the JS bundle at build time**.
  Editing `.env` does nothing until you rebuild *and* redeploy.
- Current key is the newer service-account-bound format (`AQ.` prefix, 53 chars), not
  classic `AIza`. **Service-account-bound keys cannot take HTTP-referrer restrictions** —
  the option is greyed out in Cloud Console. There is no way to lock it to a domain.
- It is therefore publicly readable by anyone who opens the app. This is inherent to
  calling Gemini from the browser.
- **Actual exposure is negligible**: spend is ~₪0.43/month, two users, unlisted app.
  A budget alert is the proportionate mitigation. A Cloud Function proxy would remove the
  exposure entirely but was judged not worth an hour of work plus cold-start latency.
  Revisit only if the app opens to more users or spend jumps.

Symptom guide: `API_ERROR:400` with "API key not valid" means the key baked into the live
bundle is wrong — check `.env` matches the key in AI Studio, then rebuild.

---

## 10. i18n

Every user-visible string goes in **both** the `en` and `he` blocks of `i18n.js`.
Hebrew is a full RTL layout (`[dir="rtl"]` overrides at the end of `index.css`).
Two pre-existing duplicate `moveToShared` keys (lines ~164, ~484) are harmless.

---

## 11. Offline Support (added 2026-07-22)

The app previously showed a blank page with no connection. Now works offline.

**Three layers:**

1. **`firebase.js`** — `initializeFirestore` with `persistentLocalCache` +
   `persistentMultipleTabManager`. Reads come from IndexedDB; writes queue and replay on
   reconnect, silently.

2. **`public/service-worker.js`** — caches the app shell in `pb-shell-v1`.
   - Navigations → **network-first**, cached shell as fallback.
     Must stay network-first, or `useAutoUpdate` never sees new deploys.
   - `/static/**` (hashed, immutable) → cache-first.
   - Cross-origin (Firestore, Gemini, Maps, FX rates) → untouched.
   - `pruneStaleAssets()` drops bundles the fresh index.html no longer references.

3. **`firestoreWrite.js`** — `queuedWrite(promise)`.

**Why `queuedWrite` exists** (verified empirically, do not "simplify" it away):
Firestore settles a write promise only on *server* acknowledgement. Offline, the local
cache applies the write and `onSnapshot` fires immediately with
`hasPendingWrites: true` — but `await addDoc(...)` **never resolves**. Any UI state behind
that await (closing a modal, clearing a spinner) hangs forever. Measured: an unwrapped
buy-flow hung indefinitely; wrapped, it completes in ~1 ms.

`queuedWrite` returns as soon as the write is queued, with a 2 s timeout covering
"lying online" cases (captive portals, dead wifi where `navigator.onLine` is true).
`newDocRef()` exists because `addDoc` cannot return an ID offline — `doc()` generates one
client-side.

**Rule: any `await` on a Firestore write that gates UI state must be wrapped in `queuedWrite`.**

**Works offline:** open app, view/edit Quick List, add expenses, balance and stats, all
budget maths. **Needs network:** first-ever load, sign-in, receipt scan, AI price
estimates, nearby shops — each shows a "needs internet" toast via `notifyOffline()`.

**Testing offline:** build, `npx serve -s build -l 3001`, load once, stop the server,
reload. The page must still boot. On iOS, an installed PWA caches hard — force-close is
often not enough; remove from home screen and re-add.

---

## 12. Known ESLint Warnings (non-blocking, pre-existing)

| File | Line | Warning |
|------|------|---------|
| `App.js` | 113 | missing `user` dep in `useEffect` |
| `Dashboard.js` | 2378 | `today` unused |
| `Dashboard.js` | 4063 | `maxTodaySpend` unused |
| `Dashboard.js` | 4064 | `inOverdraft` unused |
| `i18n.js` | 164, 484 | duplicate key `moveToShared` |

`inOverdraft` is computed but never rendered — there is **no** "over today's budget"
banner in the code despite one appearing in old screenshots. That banner is from a stale
cached build.

---

## 13. Git State

- **Branch:** `feature/quantities-discounts`
- **HEAD:** `b389e65 fix: surface Gemini API error message instead of bare status code`
- Prior: `3aaab91 feat: restore v5 teal+coral design, add offline support`
- Git is a save-point system here, not a PR workflow.
- **No remote.** The repo exists only on this machine.

**Two things worth fixing:**

1. **`.env` is tracked in git.** `.gitignore` covers `.env.local` and friends but not plain
   `.env`, so the Gemini key is in commit history (`b389e65`, `ce3abe2`). Harmless while
   the repo is local-only; it would travel with the repo if pushed to GitHub. Fix:
   ```bash
   git rm --cached .env && echo ".env" >> .gitignore
   ```
   (History would still hold it — rotate the key if the repo is ever pushed.)

2. **No off-machine backup.** Today's recovery worked only because the dev site happened
   to ship source maps. That was luck. A private remote would make it deliberate.

---

## 14. Architectural Rules

1. **Verify live vs local before deploying** — §0.
2. **Deploy rules before hosting** when `firestore.rules` changes.
3. **No Firestore compound queries** — filter client-side to avoid composite indexes.
4. **CSS vars everywhere**; keep the design-token comments.
5. **All UI lives in `Dashboard.js`** — no separate component files.
6. **No Cloud Functions** — client-side only.
7. **Normalize `groupMode`**: `(group.groupMode || 'trip').toLowerCase()`.
8. **lucide-react icons only** — no emoji in UI.
9. **i18n both locales** for every visible string.
10. **Wrap UI-gating Firestore writes in `queuedWrite`** — §11.
11. **Mirror changes between `ShoppingListTab` and `OtherListDetail`** — §7.
12. `shopping_list.addedAt` stays `new Date()`, not `serverTimestamp()` — §5.

---

## 15. Open / Discussed but Not Built

**Mutual (shared) budget** — user wants the budget in settings to cover the whole group,
not per-member. Design questions raised, answered only in part before the thread moved on:

- Rollover: one shared pot vs per-member (leaning: one shared pot, needs a transaction
  guard so two phones don't double-process)
- Header display: group totals for everyone vs group budget with own spend
- Whether borrow settings and big expenses become group-level
- Migration of existing per-member `running_balance` when switching mode on

Touches `todayBalance`, `myTodayTotal` (currently filters `e.uid === user.uid`),
`processDays()`, borrow, big expenses, and the Sunday prompt.

**Home Mode remaining:**
- Wire `autoDeduct: true` recurring expenses into the daily balance (same pattern as big expenses)
- Reminders for `variable` recurring expenses on their due date
- Dashboard income vs. recurring-expenses summary card

**Optional hardening:** budget alert in Cloud Billing (recommended, 5 min);
Cloud Function proxy for Gemini (deferred, see §9).

---

## 16. Live URLs

| Env | URL |
|-----|-----|
| PROD | https://pocket-budget-manager.web.app |
| DEV | https://pocket-budget-manager-dev.web.app |

Both currently run the same build: v5 teal+coral + offline support + working Gemini key.

---

## 17. Working Style

- Terse replies, no filler. Code and commit messages written normally.
- Deploy to PROD by default unless DEV is stated.
- Don't touch API keys — hand the user the exact command and let them run it.
- Verify claims against the live site or a real test, not memory — every wrong assumption
  in this project's history came from trusting local state without checking.
