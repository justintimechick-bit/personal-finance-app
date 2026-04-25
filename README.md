# Personal Finance App

A local-first personal finance tracker. You log paychecks, manually allocate them across your accounts and debts, and watch your net worth (and trends) over time. No backend, no signup — your data lives in your browser's IndexedDB and an optional JSON file on your filesystem.

## Features

- **Dashboard** — net worth, liquid / invested / other / debt rollups, CC runway warning, savings rate YTD, tier suggestions
- **Payday** — log a paycheck and split it across your accounts and liability paydowns. Auto-reserves bank-transfer expenses (rent, insurance, etc.) in checking. Live "remaining" math; "Use suggested" pre-fills from your tier waterfall (suggestion only, never auto-applied)
- **Accounts** — edit balances, drag-reorder for the Payday display, mark accounts as "not opened yet"
- **Manage** — configure income sources, fixed expenses, and the (optional) tier waterfall used to generate suggestions
- **Trends** — multi-line chart of net worth, liquid, debt, and credit-card balances over time
- **Settings** — file sync, app preferences, bulk import, manual JSON backup, danger-zone reset/wipe

## Setup (for new users)

```bash
git clone <repo-url> personal-finance-app
cd personal-finance-app
npm install
npm run dev
```

Open http://localhost:5173 in **Chrome** or **Edge** (file sync uses the File System Access API).

### First launch

You'll land on the **Onboarding** screen with three options:

1. **Use sample template** — populates a realistic example dataset (Chase Checking, Roth IRA, biweekly paycheck, etc.) so you can poke around. You can edit or wipe later.
2. **Import from Excel** — download the `.xlsx` template, fill in your real numbers in Excel/Numbers/Sheets, upload it back. Validates row-by-row before applying. Best path if you have your data somewhere already.
3. **Start from scratch** — empty workspace; you add accounts, liabilities, income, and expenses one at a time.

### Linking a sync file (recommended)

Go to **Settings → Local File Sync → Create new file…** and pick a path (e.g., inside iCloud Drive). Every change auto-saves to that file. To use the same data on another browser/machine, click **Open existing file…** and point at the same `.json`.

## Daily flow

1. **Payday** — paste your net amount, split it across accounts (HYSA, Roth, brokerage, etc.) and any liability paydowns. The Chase Checking row pre-fills with the amount needed to cover this period's bank-transfer expenses (rent, car insurance, student loan auto-pays). Click **+ Fill remainder** on a row to dump the rest there. Apply unlocks when **Remaining = $0**.
2. **Accounts** — when a real-world balance drifts from what the app projects, click the row to edit it directly.
3. **Trends** — every applied paycheck logs a snapshot, so you'll see the four lines (net worth / liquid / debt / credit cards) tick forward.

The app records what *should* happen; you still need to physically move the money (HYSA transfer, Roth contribution, CC payment).

## Bulk import format

The xlsx template (`public/finance-setup-template.xlsx`) has one sheet per entity:

| Sheet | Required columns |
|---|---|
| Accounts | name, type, balance |
| Liabilities | name, type, balance, apr, minimumPayment, isRevolving, isActive |
| Income | name, sourceType, amount, cadence, depositAccount, isActive |
| Expenses | name, category, amount, cadence, paymentMethod, isActive |
| Tiers *(optional)* | priority, name, cap, capType, targetAccount, resetCadence, isActive |

The README sheet inside the workbook lists allowed enum values. Cross-references (`Income.depositAccount`, `Tier.targetAccount`) must match an `Accounts.name` row in the same file. Validation is row-by-row with clear error messages — no partial imports.

To regenerate the template (e.g., after adding a field):

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
- `settings` — CC reserve buffer, Roth cap, target savings rate, etc.

`exportAllData()` / `importAllData()` round-trip the whole DB through a single JSON object — that's what file sync and the Manual Backup buttons use.

## Browser support

| Browser | Status |
|---|---|
| Chrome / Edge | Full support, including auto file sync |
| Safari / Firefox | App works; File System Access API not available — use **Settings → Manual Backup → Download / Upload** instead |

## Resetting

**Settings → Danger Zone**:
- **Reset to seed data** — re-plants the sample template (wipes paycheck history & balance changes).
- **Wipe all data (empty)** — clears every table; next reload lands on Onboarding so you can re-import or start over. Use this before recording a screencast or sharing screenshots.

## Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Or import the repo from vercel.com (Vite is auto-detected). The deployed app runs from Vercel; your data still lives in your browser.

> Note: Each origin has its own IndexedDB, so opening the deployed URL on a fresh browser shows an empty workspace. Use **Open existing file…** to point at your linked JSON, or upload your last backup.

## Backup strategy

- **Primary**: Linked sync file in iCloud Drive (or Dropbox/Drive). Every change auto-saves.
- **Fallback**: Periodically click **Settings → Manual Backup → Download backup** and stash dated copies somewhere safe.

## Troubleshooting

- **"File permission needed" in sidebar** — Chrome revoked access after long idle. Click **Save now** in Settings or re-link.
- **Empty app after deploying** — fresh origin = empty IndexedDB. Restore via **Open existing file…** or **Upload backup**.
- **"Apply paycheck failed: object store not found"** — your IndexedDB is from an older schema. Wipe via Settings → Danger Zone, then reload.

## Tech stack

React 18 + TypeScript + Vite, Tailwind for styling, Dexie for IndexedDB, Recharts for charts, Zustand for app-level UI state, `read-excel-file` for `.xlsx` import (lazy-loaded). No backend, no auth, no telemetry.
