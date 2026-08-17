# Pocket Budget

A shared budgeting PWA for couples and small groups — split daily spending, scan receipts
with AI, and keep a running balance that rolls over day to day.

**Live:** https://pocket-budget-manager.web.app

Built as a real tool for tracking a shared travel budget, then extended into a household
expense manager. Bilingual (English / Hebrew RTL), installable, and works offline.

---

## What it does

**Shared daily budget with rollover.** Each member has a running balance. Underspend today
and tomorrow's balance grows; overspend and it shrinks. The app never blocks an expense —
it warns inline and shows a persistent banner when a balance goes negative.

**AI receipt scanning.** Point the camera at a receipt (or upload a photo) and Gemini
extracts line items, store, total, and date. A review sheet lets you correct items,
assign them per member, and split totals before anything is written. Duplicate receipts
scanned within 30 days are flagged.

**Groups and invites.** Create a group, share an invite code, and everyone sees the same
expenses, shopping lists, and notes in real time via Firestore listeners.

**Two modes.** *Trip mode* is a daily allowance with rollover. *Household mode* adds
income tracking and recurring expenses with fixed (auto-deducted) or variable (reminder
only) types, monthly or weekly, split equally or by custom per-member amount.

**Also:** category stats with hand-rolled SVG donut and trend charts, per-member savings
boxes, big expenses amortized across N days, shared and personal shopping lists with
price estimates, a personal product price catalog, shared group notes, and multi-currency
with FX conversion.

## Stack

| | |
|---|---|
| Frontend | React 18 (Create React App), CSS variables for theming, `lucide-react` icons |
| Backend | Firebase — Auth (email/password), Firestore with offline persistence, Hosting |
| AI | Google Gemini 2.5 Flash (`generativelanguage` REST API) for receipt OCR and price estimation |
| Charts | Custom SVG components, no charting library |
| i18n | Hand-rolled EN/HE context with full RTL layout support |
| PWA | Service worker with cache invalidation on activate, installable manifest |

No component library and no charting library — the UI, the charts, and the i18n layer are
all built from scratch.

## Running locally

```bash
npm install
cp .env.example .env    # then add your own Gemini API key
npm start
```

Firestore emulators (auth `9099`, firestore `8080`, UI `4000`) are configured in
`firebase.json`:

```bash
npx firebase-tools emulators:start
```

### Environment

| Variable | Purpose |
|---|---|
| `REACT_APP_GEMINI_API_KEY` | Google AI Studio key for receipt scanning and price estimates |

Firebase web config lives in `src/firebase.js`. Those values are public identifiers by
design — access control is enforced entirely by `firestore.rules`, not by hiding the config.

## Deploying

```bash
npm run build && npx firebase-tools deploy --only hosting --project pocket-budget-manager
```

`.github/workflows/deploy-dev.yml` auto-deploys pushes to the dev project. Production
deploys are manual and deliberate.

## Layout

```
src/
  App.js              auth gate → GroupSetup or Dashboard
  AuthScreen.js       email/password sign in and sign up
  GroupSetup.js       create group or join by invite code
  Dashboard.js        all tabs, pages, and modals (see CONTEXT.md for the component map)
  receiptService.js   Gemini calls — receipt OCR, price estimation
  pricedb.js          local price reference data
  i18n.js             EN/HE strings
  firebase.js         SDK init + offline persistence
firestore.rules       per-group access control
```

`Dashboard.js` is large and intentionally single-file; `CONTEXT.md` carries a component
map with line offsets and the architectural notes.

## License

Personal project. Not licensed for reuse.
