// Generates public/finance-setup-template.xlsx — a multi-sheet workbook the
// user fills in to bulk-import their accounts, liabilities, income, and expenses.
// Run with: node scripts/generate-template.mjs
// xlsx is a devDependency so it never lands in the runtime bundle.

import * as XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'public', 'finance-setup-template.xlsx');

const wb = XLSX.utils.book_new();

/**
 * Compose a sheet with a "KEY" legend block above the headers.
 * The parser scans for the actual header row, so anything before it is ignored.
 *
 *   KEY                                         (banner)
 *   field — allowed values / format             (1+ legend rows)
 *   ...
 *   (blank row separator)
 *   header1*  header2  ...                      (real headers)
 *   row 1 data
 *   row 2 data
 *   ...
 */
function sheetWithKey(legend, headers, rows) {
  return [
    ['KEY — fields that will fail validation if entered incorrectly:'],
    ...legend,
    [],
    headers,
    ...rows,
  ];
}

// --- README sheet ---
const readme = [
  ['Finance App — Setup Template'],
  [],
  ['Fill in each sheet, then upload this file via the Onboarding screen or Settings → Bulk Setup From File.'],
  ['One row per record. Required columns are flagged with * in the column header. Leave optional cells blank if unused.'],
  ['You can delete the example rows; they are just there to show the shape.'],
  ['Each sheet has its own KEY at the top — that block is ignored by the importer, it is for your reference only.'],
  [],
  ['Cross-references that must match exactly (by name):'],
  ['  Income.depositAccount → must equal an Accounts.name in this file'],
  ['  Tiers.targetAccount    → must equal an Accounts.name in this file'],
  [],
  ['Booleans accept: true / false / yes / no / 1 / 0'],
  ['Dates accept: YYYY-MM-DD or any standard format Excel exports'],
  ['Numbers accept: $1,200.00 (commas and $ are stripped)'],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readme), 'README');

// --- Accounts ---
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetWithKey(
  [
    ['type', 'one of: checking, hysa, roth_ira, brokerage, cash, other'],
    ['name', 'required; must be unique within this sheet'],
    ['balance', 'number (e.g., 500 or 1,250.43)'],
    ['openedYet', 'true / false — defaults to true if blank'],
    ['sortOrder', 'optional integer — display order on Payday & Accounts'],
  ],
  ['name*', 'type*', 'balance*', 'institution', 'openedYet', 'sortOrder', 'notes'],
  [
    ['Chase Checking', 'checking', 500, 'Chase', true, 0, 'Primary checking'],
    ['Ally HYSA', 'hysa', 2000, 'Ally', true, 1, 'Emergency fund'],
    ['Fidelity Roth IRA', 'roth_ira', 1500, 'Fidelity', true, 2, ''],
    ['Fidelity Brokerage', 'brokerage', 5000, 'Fidelity', true, 3, ''],
  ],
)), 'Accounts');

// --- Liabilities ---
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetWithKey(
  [
    ['type', 'one of: credit_card, student_loan, auto_loan, personal_loan, other'],
    ['apr', 'decimal (0.22 = 22%)'],
    ['isRevolving', 'true / false — credit cards = true, installment loans = false'],
    ['isActive', 'true / false — uncheck to exclude from totals'],
    ['dueDate', 'optional, YYYY-MM-DD; drives the CC runway warning on Payday'],
  ],
  ['name*', 'type*', 'balance*', 'apr*', 'minimumPayment*', 'isRevolving*', 'isActive*', 'dueDate', 'notes'],
  [
    ['Chase Sapphire CC', 'credit_card', 450, 0.22, 30, true, true, '2026-05-15', 'Paid in full each cycle'],
    ['Federal Student Loan', 'student_loan', 18000, 0.055, 200, false, true, '', ''],
    ['Auto Loan', 'auto_loan', 12000, 0.065, 250, false, true, '', ''],
  ],
)), 'Liabilities');

// --- Income ---
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetWithKey(
  [
    ['sourceType', 'one of: paycheck, bonus, gift, reimbursement, side_income, other'],
    ['cadence', 'one of: weekly, biweekly, semimonthly, monthly, quarterly, annual, irregular'],
    ['depositAccount', 'must match an Accounts.name in the Accounts sheet of this file'],
    ['amount', 'number — net per period for paychecks, total per event for irregular sources'],
  ],
  ['name*', 'sourceType*', 'amount*', 'cadence*', 'depositAccount*', 'isActive*', 'notes'],
  [
    ['Day Job Paycheck', 'paycheck', 2200, 'biweekly', 'Chase Checking', true, '26 paydays/year'],
    ['Freelance', 'side_income', 500, 'irregular', 'Chase Checking', true, 'Logged per gig'],
  ],
)), 'Income');

// --- Expenses ---
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetWithKey(
  [
    ['category', 'one of: housing, food, transportation, insurance, debt, subscriptions, entertainment, health, misc'],
    ['cadence', 'one of: weekly, biweekly, semimonthly, monthly, quarterly, annual, irregular'],
    ['paymentMethod', 'one of: Bank Transfer, Credit Card, Cash, Autopay, Other (case-sensitive)'],
    ['', '  ↳ Bank Transfer expenses reserve cash in checking each paycheck'],
    ['', '  ↳ Credit Card expenses grow your CC balance instead'],
  ],
  ['name*', 'category*', 'amount*', 'cadence*', 'paymentMethod*', 'isActive*', 'notes'],
  [
    ['Rent', 'housing', 1400, 'monthly', 'Bank Transfer', true, ''],
    ['Car Insurance', 'insurance', 150, 'monthly', 'Bank Transfer', true, ''],
    ['Student Loan Payment', 'debt', 200, 'monthly', 'Bank Transfer', true, ''],
    ['Auto Loan Payment', 'debt', 250, 'monthly', 'Bank Transfer', true, ''],
    ['Groceries', 'food', 400, 'monthly', 'Credit Card', true, ''],
    ['Gas', 'transportation', 160, 'monthly', 'Credit Card', true, ''],
    ['Utilities', 'housing', 120, 'monthly', 'Credit Card', true, ''],
    ['Netflix', 'subscriptions', 15, 'monthly', 'Credit Card', true, ''],
    ['Gym', 'health', 40, 'monthly', 'Credit Card', true, ''],
  ],
)), 'Expenses');

// --- Tiers (optional sheet) ---
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetWithKey(
  [
    ['priority', 'integer — 0 fills first in the suggestion waterfall'],
    ['capType', 'one of: fixed, dynamic, unlimited'],
    ['', '  ↳ fixed = stop at "cap"; dynamic = computed at runtime; unlimited = catch-all'],
    ['resetCadence', 'one of: none, annual, monthly, per_statement'],
    ['targetAccount', 'must match an Accounts.name in the Accounts sheet of this file'],
    ['cap', 'number — required, even when capType is unlimited (use 0)'],
  ],
  ['priority*', 'name*', 'cap*', 'capType*', 'targetAccount*', 'resetCadence*', 'isActive*', 'notes'],
  [
    [0, 'CC Float Reserve', 0, 'dynamic', 'Chase Checking', 'per_statement', true, 'Suggests CC balance + buffer in checking'],
    [1, 'Emergency Fund', 10000, 'fixed', 'Ally HYSA', 'none', true, 'Fill HYSA to $10,000'],
    [2, 'Roth IRA', 7000, 'fixed', 'Fidelity Roth IRA', 'annual', true, '$7k annual cap'],
    [3, 'Taxable Brokerage', 0, 'unlimited', 'Fidelity Brokerage', 'none', true, 'Catches overflow'],
  ],
)), 'Tiers');

const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
writeFileSync(outPath, buf);
console.log(`Wrote ${outPath} (${buf.length} bytes)`);
