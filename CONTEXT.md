# Pocket Budget — Session Context Dump

> Last updated: 2026-06-23. Use this to onboard a new Claude Code session with zero ramp-up.

---

## 1. Project Structure

```
berlin-budget/
├── .env                          # REACT_APP_GEMINI_API_KEY=...
├── .firebaserc                   # default project = pocket-budget-manager (PROD)
├── firebase.json                 # Firestore rules + emulator config + hosting
├── firestore.rules               # All Firestore security rules
├── package.json
├── public/
│   ├── index.html
│   ├── manifest.json             # PWA manifest
│   ├── service-worker.js
│   └── logo-header-v4.png        # Current logo
└── src/
    ├── App.js                    # Auth gate → GroupSetup or Dashboard
    ├── AuthScreen.js             # Email/password sign-in & sign-up
    ├── Dashboard.js              # ~4620 lines — ALL UI components live here
    ├── GroupSetup.js             # Create group / join with invite code
    ├── LanguageContext.js        # React context for EN/HE language switching
    ├── firebase.js               # Firebase init — switches dev/prod on REACT_APP_ENV
    ├── firebase.dev.js           # (unused duplicate, ignore)
    ├── i18n.js                   # ~607 lines — all strings EN + HE
    ├── index.css                 # ~1040 lines — all styles, CSS vars for theming
    ├── index.js                  # React root
    ├── pricedb.js                # Price estimation + currency conversion helpers
    ├── receiptService.js         # Gemini AI: receipt scan, price estimate, categorize
    └── utils.js                  # getDailyBudget, date helpers, CATEGORIES, etc.
```

---

## 2. Tech Stack

- **React 19.2.6** via Create React App (PWA)
- **Firebase SDK v12**: Firestore (real-time `onSnapshot`), Auth (email/password), Hosting
- **No Firebase Functions** — all logic is client-side
- **Lucide-react v1.16** — icons only (no emoji icons in UI)
- **Gemini 2.5 Flash** — receipt scanning + price estimation (REST API, not SDK)
- **Two Firebase projects**:
  - `pocket-budget-manager` — **PROD** (live at `pocket-budget-manager.web.app`)
  - `pocket-budget-manager-dev` — **DEV** (live at `pocket-budget-manager-dev.web.app`)

---

## 3. Build / Deploy Commands

```bash
npm start                  # local dev → hits LOCAL EMULATORS (auth:9099, firestore:8080)
npm run deploy:dev         # builds with REACT_APP_ENV=dev → deploys to DEV Firebase project
npm run deploy             # builds prod → deploys to PROD Firebase project

# Rules-only deploys (always do this before hosting when rules changed):
firebase deploy --only firestore:rules --project pocket-budget-manager-dev
firebase deploy --only firestore:rules --project pocket-budget-manager
```

**CRITICAL**: All current Household Mode development goes **DEV only**. Never run `npm run deploy` (prod) for Household Mode work.

---

## 4. Environment Variables

`.env` file in project root:
```
REACT_APP_GEMINI_API_KEY=...   # Gemini API key
```

`REACT_APP_ENV=dev` is injected at build time by the `build:dev` script — not in `.env`.

---

## 5. Firebase Config

`src/firebase.js` switches on `process.env.REACT_APP_ENV === 'dev'`:
- **Dev**: `projectId: "pocket-budget-manager-dev"`
- **Prod**: `projectId: "pocket-budget-manager"`

`npm start` (without `REACT_APP_ENV=dev`) → hits local emulators on `localhost:9099` (auth) + `localhost:8080` (Firestore).

---

## 6. Firestore Data Model

```
/users/{uid}
  └── groupId: string

/groups/{groupId}                         ← groupId === admin's uid
  ├── adminUid: string
  ├── budgetMode: 'daily' | 'weekly'
  ├── budgetAmount: number
  ├── currency: string (symbol: '₪','€','$','£')
  ├── inviteCode: string
  ├── groupMode: 'trip' | 'home'          ← NEW; normalize .toLowerCase(); missing = 'trip'
  ├── savings_box_shared: number
  ├── shared_savings_contributors: { [uid]: number }
  ├── sharedNotes: string
  ├── sharedNotesUpdatedAt: timestamp
  ├── sharedNotesUpdatedBy: string
  └── createdAt: timestamp

  /members/{uid}
    ├── uid, displayName, email, role ('admin'|'user')
    ├── running_balance: number           ← cumulative net (surplus - deficit across days)
    ├── last_day_processed: 'YYYY-MM-DD'
    ├── savings_box_personal: number
    ├── last_sunday_prompt: string|null
    ├── borrow_enabled: bool              ← allows borrowing from tomorrow's budget
    ├── avatarUrl: string (base64 jpeg)
    └── notes: string

  /expenses/{expenseId}
    ├── uid, description, amount, cat (category id), date ('YYYY-MM-DD')
    ├── originalAmount, originalCurrency  ← set when expense is in foreign currency
    ├── photoUrl: string (base64)
    └── createdAt

  /daily_records/{YYYY-MM-DD}
    └── { [uid]: { total_spent, debt, surplus, daily_budget } }

  /big_expenses/{expId}
    ├── uid (owner), description, totalAmount, paidAmount
    ├── active: bool
    ├── createdBy: string                 ← filter client-side by createdBy===user.uid
    ├── installments: number, daysRemaining: number
    └── createdAt

  /product_catalog/{uid}/items/{itemId}
    ├── name, price, unit, barcode (optional)
    └── updatedAt

  /receipts/{receiptId}
    ├── storeName, total, items: [], receiptDate
    └── createdBy, createdAt

  /shopping_list/{itemId}
    ├── text, checked: bool, addedBy, qty, unit, estimatedPrice
    └── createdAt

  /named_lists/{listId}
    ├── name, emoji, createdBy, createdAt
    └── /items/{itemId}: { text, checked, addedBy, qty, unit, estimatedPrice, createdAt }

  /income/{incomeId}                      ← HOME MODE ONLY
    ├── uid, description, amount
    ├── frequency: 'monthly'|'weekly'|'once'
    ├── isShared: bool
    ├── startDate: 'YYYY-MM-DD'
    └── createdAt

  /recurring_expenses/{recId}             ← HOME MODE ONLY
    ├── uid, description, amount
    ├── frequency: 'monthly'|'weekly'
    ├── type: 'fixed'|'variable'
    ├── autoDeduct: bool                  ← true when type==='fixed'
    ├── dayOfMonth: number|null           ← 1–28, only for monthly
    ├── isShared: bool
    ├── splitType: 'equal'|'custom'       ← only when isShared
    ├── customSplit: { [uid]: number }    ← only when splitType==='custom'
    └── createdAt
```

---

## 7. Firestore Security Rules Summary

All subcollections live inside `match /groups/{groupId}`. Helper functions at the bottom:
- `isMember(groupId)` — checks `/groups/{groupId}/members/{uid}` exists
- `isAdmin(groupId)` — checks `group.adminUid === request.auth.uid`

Key rules:
- `income`: members read/create; owner-only delete
- `recurring_expenses`: members read/create; owner or admin delete
- `big_expenses`: members read/write (no per-user restriction at rules level — filtered client-side)
- `expenses`: members read/create/update; owner or admin delete

**WARNING**: Adding subcollection rules inside `match /groups/{groupId}` once broke all reads for all users. Always deploy rules first, verify compile succeeds, then deploy hosting.

---

## 8. Dashboard.js Component Map

| Lines | Component / Section |
|-------|---------------------|
| 91 | `ExpenseItem` — single expense row |
| 155 | `ExpensesTab` — expense list with filters |
| 269 | `StatsTab` — charts, per-category breakdown |
| 400 | `MembersTab` — balances, savings box |
| 521 | `ProfilePage` — full-page overlay (profile, savings, big expenses) |
| 745 | `ScannedReceiptsPage` — receipt history |
| 915 | `SettingsTab` — budget, currency, invite code, admin controls |
| 1196 | `ProductsTab` — personal price catalog |
| 1416 | `ShoppingListTab` — shared shopping list with price estimates & nearby shops |
| 2081 | `OtherListDetail` / `OtherListsPage` — named custom lists |
| 2482 | `MyListsPage` — personal lists |
| 2639 | `NotesPage` — shared group notes |
| 2724 | `IncomePage` — **HOME MODE** income tracking |
| 2875 | `getNextPaymentDate` / `formatNextPayment` helpers |
| 2905 | `RecurringExpensesPage` — **HOME MODE** recurring expenses |
| 3175 | `ReceiptReviewModal` — post-scan review & add expenses |
| 3380 | `ReassignModal` — move expense to another member |
| 3407 | `AvailableInfoPopup` — "how is this calculated" popup |
| 3438 | `BigExpenseSheet` — big expense management overlay |
| 3596 | `SundayPromptModal` — weekly savings prompt |
| 3635 | `usePullToRefresh` hook |
| 3655 | **Main `Dashboard` component** — all state, effects, render tree |

---

## 9. What's Been Built

### Core Trip Mode (deployed to PROD + DEV)

- Email/password auth; group create/join via invite code
- Daily/weekly budget with rollover (`running_balance` per member)
- Expense tracking with categories, photos (base64), date editing, reassign to partner
- Stats tab: charts, per-category breakdown, date range filters
- Members tab: per-member running balance, savings box (personal + shared)
- Settings: budget mode/amount, currency (with FX conversion), invite code, reset rollover
- Big expenses: spread large purchases over N days, deduct daily from balance
- Shopping list: shared, with Gemini price estimates, nearby shops (Google Maps link)
- Named custom lists (Other Lists) + personal My Lists
- Shared group notes
- Receipt scanning via Gemini (camera or upload → items → review → add expenses)
- Product price catalog (personal, per-user)
- Sunday savings prompt (weekly)
- Pull-to-refresh
- Hebrew RTL + English language toggle
- PWA (installable, service worker, `Cache-Control: no-cache` on index.html)
- CSS variable theming throughout

### Household Mode (DEV only — requires `groupMode: 'home'` on group doc)

- `groupMode` field on group doc — new groups default to `'trip'`; admin migration button in Settings (shown only when field is `null`)
- `groupMode` normalized via `.toLowerCase()` in main Dashboard (handles `"Home"` vs `"home"`)
- **Income page** (`/income` subcollection): real-time list grouped Shared / Personal; add form with description, amount, frequency (monthly/weekly/once), isShared toggle; delete own entries only
- **Recurring Expenses page** (`/recurring_expenses` subcollection):
  - Flat list; each row shows description, frequency badge, Fixed/Variable badge, optional share badge, and **"Next: \<date\>"** line
  - Add form: description, amount, Monthly/Weekly toggle, Fixed/Variable toggle (Fixed = auto-deduct daily; Variable = reminder only), day-of-month input (monthly only), Shared expense toggle → Split equally or Choose amount per member
  - `autoDeduct` stored on write (`type === 'fixed'`); `customSplit: { [uid]: amount }` stored for custom splits
  - Next payment date calculated from `dayOfMonth` (monthly) or `createdAt` day-of-week (weekly)
- Both pages accessible from gear (⚙️) menu only when `groupMode === 'home'`
- Firestore rules deployed for both `income` and `recurring_expenses`

---

## 10. Balance Calculation

```js
const dailyBudget    = getDailyBudget(group);  // budgetAmount or budgetAmount/7
const runningBalance = memberData.running_balance || 0;

// Each day at rollover: net = dailyBudget - daySpent; added to running_balance
const todayBalance   = runningBalance - myTodayTotal + dailyBudget;

const borrowFraction = (memberData.borrow_enabled ?? false) ? 0.5 : 0;
const canStillSpend  = Math.max(0, todayBalance + dailyBudget * borrowFraction);
```

Big expenses deduct `totalAmount / installments` per day from the `canStillSpend` display. Big expenses are filtered client-side by `createdBy === user.uid` (not a Firestore query) to avoid needing a composite index.

---

## 11. Gemini AI Config (receiptService.js)

**Always use**: `model: gemini-2.5-flash`, `thinkingBudget: 0`, `temperature: 0.1` — **never change these**.

Three exported functions:
- `scanReceipt(base64, mimeType)` — extract items from receipt image
- `fetchGeminiPriceEstimate(itemName, country)` — price estimate for shopping list item
- `categorizeItemsByStore(storeName, items)` — assign expense categories post-scan

---

## 12. Known Pre-existing ESLint Warnings (non-blocking)

These existed before this session and do not prevent builds:

| File | Line | Warning |
|------|------|---------|
| `src/App.js` | 107 | Missing `user` dependency in `useEffect` |
| `src/Dashboard.js` | 2233 | `today` assigned but never used |
| `src/Dashboard.js` | 3846 | `inOverdraft` assigned but never used |
| `src/i18n.js` | 158, 461 | Duplicate key `moveToShared` in HE section |

---

## 13. Git State

- **Branch**: `feature/quantities-discounts`
- All changes are **uncommitted** — working tree is current state. No stash.
- Last commit: `ce3abe2 chore: snapshot before receipt scanning feature`
- Git is used as a save-point system here, not for PRs/branches per feature.

---

## 14. Architectural Rules & Things to Avoid

1. **Deploy rules before hosting** whenever `firestore.rules` changes — a prior incident where subcollection rules were added caused all group reads to fail for all users.
2. **Never deploy Household Mode work to PROD** — use `npm run deploy:dev` only.
3. **No Firestore compound queries** — avoid composite index requirements by filtering client-side (e.g. `snap.docs.filter(e => e.createdBy === user.uid)`).
4. **CSS vars everywhere** — hardcoded hex colors only where CSS vars resolve as transparent (known issue: nearby shops modal uses `#fff`/`#F8F9FA`).
5. **All UI components live in `Dashboard.js`** — no separate component files.
6. **No Firebase Functions** — all logic is client-side React.
7. **`groupMode` must be normalized**: `(group.groupMode || 'trip').toLowerCase()`.
8. **Lucide-react icons only** — no emoji icons in UI elements.
9. **i18n for every user-visible string** — add to both `en` and `he` blocks in `i18n.js`.

---

## 15. Household Mode — Planned But Not Yet Built

- Wire `autoDeduct: true` recurring expenses into the daily balance calculation (same pattern as big expenses — divide amount by days in period, deduct daily from `canStillSpend`)
- Reminder/notification system for `variable` recurring expenses on their due date
- Dashboard-level income vs. recurring expenses summary card

---

## 16. Live URLs

| Environment | URL |
|-------------|-----|
| DEV | https://pocket-budget-manager-dev.web.app |
| PROD | https://pocket-budget-manager.web.app |
