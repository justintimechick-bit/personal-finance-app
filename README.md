# Personal Finance App

A personal finance tracker that runs entirely in the browser. Log paychecks, manually allocate them across your accounts and debts, and watch your net worth (and trends) over time. No backend — your data syncs to a single JSON file in **your own Google Drive** via the Drive API (`drive.file` scope, so the app can only see files it created).

## Features

- **Dashboard** — net worth, liquid / invested / other / debt rollups, CC runway warning, savings rate YTD, tier suggestions
- **Payday** — log a paycheck and split it across your accounts and liability paydowns. Auto-reserves bank-transfer expenses (rent, insurance, etc.) in checking. Live "remaining" math; "Use suggested" pre-fills from your tier waterfall (suggestion only, never auto-applied)
- **Accounts** — edit balances, drag-reorder for the Payday display, mark accounts as "not opened yet"
- **Manage** — configure income sources, fixed expenses, and the (optional) tier waterfall used to generate suggestions
- **Trends** — multi-line chart of net worth, liquid, debt, and credit-card balances over time
- **Settings** — cloud sync, app preferences, bulk import, manual JSON backup, danger-zone reset/wipe

## Setup: Google OAuth (required for cloud sync)

This app uses Google Identity Services + the Drive API. You register one OAuth client per deployment (your Vercel URL + `localhost` for local dev). The Client ID is bundled into the JS — it's a public identifier, not a secret, but it ties the deployment to your Google Cloud project.

1. Go to **[console.cloud.google.com](https://console.cloud.google.com)** → create a new project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen** → External → fill in app name, support email, dev contact. Add **test users** (your Gmail + any friends — until you publish the app, only test users can sign in).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Web application.
   - **Authorized JavaScript origins**: your Vercel URL (e.g. `https://your-app.vercel.app`) **and** `http://localhost:5173` for local dev.
   - **No** redirect URIs needed (we use popup mode).
5. Copy the Client ID. Locally, put it in `.env.local`:
   ```
   VITE_GOOGLE_OAUTH_CLIENT_ID=123-abc.apps.googleusercontent.com
   ```
   On Vercel, add it under **Project → Settings → Environment Variables**.
6. **Publishing**: until you click **PUBLISH APP** in the OAuth consent screen, only your listed test users can sign in. After publishing, anyone can sign in but Google shows an "unverified app" warning page (Advanced → Continue to bypass). Verification is only mandatory for sensitive scopes; `drive.file` is non-sensitive, so most users will just see the yellow warning.

## Run locally

```bash
git clone <repo-url> personal-finance-app
cd personal-finance-app
cp .env.example .env.local   # paste your Client ID
npm install
npm run dev
```

Open `http://localhost:5173` in **Chrome** or **Edge**.

### First launch

You'll land on the **Onboarding** screen with up to four options:

1. **Continue with Google** *(recommended, only shown when `VITE_GOOGLE_OAUTH_CLIENT_ID` is set)* — signs in and pulls existing data from your Drive (or creates a fresh `finance-app-data.json` if none exists). Open the app on any browser and sign back in to pick up where you left off.
2. **Use sample template** — populates a realistic example dataset so you can poke around. Wipe later from Settings → Danger Zone.
3. **Import from Excel** — download the `.xlsx` template, fill in your real numbers, upload back. Validates row-by-row before applying.
4. **Start from scratch** — empty workspace; add accounts/liabilities/income/expenses one at a time.

## Daily flow

1. **Payday** — paste your net amount, split it across accounts (HYSA, Roth, brokerage, etc.) and any liability paydowns. The primary checking row pre-fills with the amount needed to cover this period's bank-transfer expenses. Click **+ Fill remainder** to dump the rest into one row. Apply unlocks when **Remaining = $0**.
2. **Accounts** — when a real-world balance drifts from what the app projects, click the row to edit it directly.
3. **Trends** — every applied paycheck logs a snapshot, so you'll see the four lines (net worth / liquid / debt / credit cards) tick forward.

The app records what *should* happen; you still need to physically move the money (HYSA transfer, Roth contribution, CC payment).

## Cloud sync details

- **What's stored**: a single file `finance-app-data.json` in the root of your Google Drive. Find it at [drive.google.com](https://drive.google.com) — searchable, downloadable, deletable from the Drive UI.
- **Scope**: `drive.file`. The app can ONLY see files it has created. It has no access to anything else in your Drive.
- **Auto-save debounce**: 1.5 seconds after the last edit. The sidebar dot turns warn-orange when there are unsaved local changes; flips back to green once the sync finishes.
- **Token expiry**: Google access tokens expire after ~1 hour. The app silently refreshes on the next sync (no popup). If your overall Google session has also expired, the sidebar shows "Re-sign in needed" and you click to renew.
- **Multi-device**: open the app in any browser, sign in with the same Google account → data is loaded from Drive. Last write wins (no merging). For a single-user app, this is fine in practice.

## Bulk import format

The xlsx template (`public/finance-setup-template.xlsx`) has one sheet per entity, with a "KEY" legend block at the top of each:

| Sheet | Required columns |
|---|---|
| Accounts | name, type, balance |
| Liabilities | name, type, balance, apr, minimumPayment, isRevolving, isActive |
| Income | name, sourceType, amount, cadence, depositAccount, isActive |
| Expenses | name, category, amount, cadence, paymentMethod, isActive |
| Tiers *(optional)* | priority, name, cap, capType, targetAccount, resetCadence, isActive |

Cross-references (`Income.depositAccount`, `Tier.targetAccount`) must match an `Accounts.name` row in the same file. Validation is row-by-row — no partial imports.

To regenerate the template (e.g. after adding a field):

```bash
node scripts/generate-template.mjs
```

## Data model

Stored in IndexedDB via Dexie:

- `accounts` — checking, HYSA, Roth, brokerage, cash, other
- `liabilities` — credit cards, student loans, auto loans, etc.
- `incomeSources` — paychecks and ad-hoc income
- `fixedExpenses` — recurring outflows. `paymentMethod` of `Bank Transfer` reserves cash in checking each paycheck; `Credit Card` grows the CC balance
- `tiers` — priority-ordered allocation suggestions (not auto-applied)
- `paycheckEvents` — log of each applied paycheck and its allocations (per-account or per-liability)
- `netWorthSnapshots` — captured on every paycheck; powers the Trends chart
- `settings` — CC reserve buffer, Roth cap, target savings rate, app name/tagline, etc.

`exportAllData()` / `importAllData()` round-trip the whole DB through a single JSON object — same shape used for cloud sync and Manual Backup.

## Browser support

| Browser | Status |
|---|---|
| Chrome / Edge | Full support |
| Safari / Firefox | Cloud sync works, but Google's third-party cookie policy can occasionally interrupt silent token refresh — sign in again from Settings if you see "Re-sign in needed" |

## Resetting

**Settings → Danger Zone**:
- **Reset to seed data** — wipes paycheck history & balance changes, restores the sample template.
- **Wipe all data (empty)** — clears every table; next reload lands on Onboarding so you can sign in / re-import / start over. The Drive file is left in place; signing back in pulls the empty state up to it (effectively wiping cloud too — back up first if you care).

## Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Or import the repo from vercel.com (Vite is auto-detected). After the first deploy:

1. Add `VITE_GOOGLE_OAUTH_CLIENT_ID` under Project → Settings → Environment Variables.
2. Add the Vercel URL to your OAuth client's **Authorized JavaScript origins** in Google Cloud Console.
3. Redeploy so the env var lands in the build.

## Backup strategy

- **Primary**: Drive sync. Every change auto-syncs to `finance-app-data.json`.
- **Fallback**: Periodically click **Settings → Manual Backup → Download backup** and stash dated copies. The download button works whether or not you're signed in — it's a pure local export.

## Troubleshooting

- **"Cloud sync not configured"** — `VITE_GOOGLE_OAUTH_CLIENT_ID` missing. Set it in `.env.local` (local) or Vercel env vars (prod) and rebuild.
- **"Re-sign in needed"** — token refresh failed silently (usually after a long idle or a different Google account in the browser). Click **Sign in** in the sidebar.
- **Empty app after signing in for the first time on a new device** — that's expected if you've never synced before. Use Onboarding's "Use sample template" or "Import from Excel" once and your new edits will sync up.
- **Can't see the Drive file in your Drive UI** — search `finance-app-data.json` directly. If you've deleted it, the app will recreate it on the next save.
- **"Apply paycheck failed: object store not found"** — your IndexedDB is from an older schema. Wipe via Settings → Danger Zone, then reload.

## Tech stack

React 18 + TypeScript + Vite, Tailwind for styling, Dexie for IndexedDB, Recharts for charts, Zustand for app-level UI state, `read-excel-file` for `.xlsx` import (lazy-loaded), Google Identity Services + Drive REST API for cloud sync. No backend, no telemetry.
