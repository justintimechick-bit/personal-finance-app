# Personal Finance App

A local-first personal finance tracker with paycheck waterfall allocation.

Data lives in two places: IndexedDB (your browser) and a JSON file on your Mac's filesystem. Every change auto-saves to both.

## What's in here

- **Dashboard** — net worth, tier progress, CC runway, savings rate
- **Payday** — enter a paycheck, preview the cascade, apply to update balances
- **Accounts** — view and edit account balances and liabilities
- **Manage** — configure income, expenses, and the allocation waterfall
- **Settings** — file sync, preferences, backup/restore

## Setup

### 1. Install dependencies

```bash
cd personal-finance-app
npm install
```

### 2. Run locally

```bash
npm run dev
```

Open http://localhost:5173 in Chrome (required for file sync).

### 3. First launch

1. Go to **Settings → Local File Sync**
2. Click **"Create new file…"**
3. Pick a location — `~/Documents/Finance/finance.json` or inside `~/Library/Mobile Documents/com~apple~CloudDocs/` (iCloud Drive) for cross-device sync
4. The app saves to that file on every change
5. The indicator in the sidebar shows sync status

If you ever open the app on a different browser profile or machine, use **"Open existing file…"** to point it at your `.json` and your data comes right back.

## Deploy to Vercel

### Option A — From the CLI

```bash
npm i -g vercel
vercel
```

Answer the prompts (new project, default settings). Your app is live at `your-project.vercel.app`.

### Option B — From GitHub

1. Push this folder to a GitHub repo (private recommended since this is your data)
2. Go to vercel.com → New Project → Import your repo
3. Framework preset: Vite (auto-detected)
4. Deploy

Open the deployed URL in Chrome on your Mac. First launch, link it to your local `.json` file like in step 3 above. The **app code** runs from Vercel; your **data** stays on your Mac.

### Domain tip

Once deployed, bookmark the Vercel URL. If you later add a custom domain, the data doesn't follow automatically (IndexedDB is per-origin) — but your linked file does. Just open the new URL and point it at the same file.

## How the waterfall works

Every paycheck cascades through tiers in priority order:

1. **Tier 0 — CC Float Reserve**: Reserves cash in checking equal to outstanding CC balance + buffer. Money "stays" in checking, doesn't transfer.
2. **Tier 1 — Starter Emergency Fund**: Fill HYSA to $1,000.
3. **Tier 2 — Full Emergency Fund**: Top HYSA to $5,000 total.
4. **Tier 3 — Roth IRA**: Annual cap of $7,000, resets Jan 1.
5. **Tier 4 — Taxable Brokerage**: Catches everything left over.

Before cascading, bank-transfer expenses (like student loans and insurance) are deducted from the paycheck. Credit-card expenses don't reduce allocable income directly; they build up on the CC and get paid off via the Tier 0 reserve.

When you click **Apply paycheck**, the app:
- Credits your checking with (net − bank expenses)
- Debits checking and credits target accounts for each cascading tier
- Logs the event for YTD tracking
- Snapshots net worth

You still need to **physically move the money** (initiate the HYSA transfer, Roth contribution, etc.) to match what the app recorded.

## Data model

All data is stored in IndexedDB via Dexie. The JSON export/sync preserves everything verbatim. Tables:

- `accounts` — checking, HYSA, Roth, brokerage
- `liabilities` — CCs and loans
- `incomeSources` — paychecks and bonuses
- `fixedExpenses` — recurring outflows
- `tiers` — the allocation waterfall config
- `paycheckEvents` — log of each applied paycheck
- `netWorthSnapshots` — net worth history for the chart
- `settings` — app-level preferences

## Browser compatibility

- **Chrome / Edge** — Full support, including auto file sync.
- **Safari** — App works, but the File System Access API is not supported. Use download/upload backups from Settings instead.
- **Firefox** — Same as Safari.

## Resetting

If you want to start over with the initial seed data, go to **Settings → Danger Zone → Reset to seed data**.

## Adding a new year's Roth cap

When the IRS raises the Roth IRA contribution limit (e.g., to $7,500 for 2027), go to **Settings → App Preferences** and update the "Roth Annual Cap" field. The Tier 3 cascade uses that value.

## When your student loans get paid off

Go to **Manage → Expenses**, uncheck "Active" on the Student Loan Payment row. The allocator will immediately stop deducting it, freeing ~$185 per biweekly paycheck to cascade to your tiers. Also go to **Accounts**, uncheck "Active" on the Student Loans liability, so net worth reflects the payoff.

## Backup strategy

- **Primary**: Your linked `.json` file. Put it in iCloud Drive for automatic backup.
- **Fallback**: Periodically click **Settings → Download backup** and keep a dated copy somewhere safe.
- If you ever lose the file, you can restore from the most recent download.

## Troubleshooting

- **Sidebar shows "File permission needed"**: Chrome revoked access after a long idle period. Go to Settings and click "Save now" or re-link the file.
- **Nothing shows up after deploying**: Vercel served a fresh origin, which has an empty IndexedDB. Click "Open existing file…" in Settings to restore your data.
- **Data mismatch between app and real accounts**: Go to Accounts and manually update balances to match reality. The app's projected balance is just a projection, not a source of truth.
