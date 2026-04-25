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

// --- README sheet ---
const readme = [
  ['Finance App — Setup Template'],
  [],
  ['Fill in each sheet, then upload this file via the Onboarding screen or Settings → Bulk Setup From File.'],
  ['One row per record. Required columns are flagged with * in the column header. Leave optional cells blank if unused.'],
  ['You can delete the example rows; they are just there to show the shape.'],
  [],
  ['Allowed values for enum columns (case-insensitive at import):'],
  [],
  ['Accounts.type', 'checking, hysa, roth_ira, brokerage, cash, other'],
  ['Liabilities.type', 'credit_card, student_loan, auto_loan, personal_loan, other'],
  ['Income.sourceType', 'paycheck, bonus, gift, reimbursement, side_income, other'],
  ['Expenses.category', 'housing, food, transportation, insurance, debt, subscriptions, entertainment, health, misc'],
  ['Cadence (Income & Expenses)', 'weekly, biweekly, semimonthly, monthly, quarterly, annual, irregular'],
  ['Expenses.paymentMethod', 'Bank Transfer, Credit Card, Cash, Autopay, Other'],
  ['Tiers.capType', 'fixed, dynamic, unlimited'],
  ['Tiers.resetCadence', 'none, annual, monthly, per_statement'],
  ['Booleans (isActive / isRevolving / openedYet)', 'true / false (or yes/no, 1/0)'],
  [],
  ['Cross-references that must match exactly (by name):'],
  ['  Income.depositAccount → must equal an Accounts.name in this file'],
  ['  Tiers.targetAccount    → must equal an Accounts.name in this file'],
  [],
  ['Date columns (Liabilities.dueDate) accept YYYY-MM-DD or any standard format Excel exports.'],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readme), 'README');

// --- Accounts sheet ---
const accounts = [
  ['name*', 'type*', 'balance*', 'institution', 'openedYet', 'sortOrder', 'notes'],
  ['Chase Checking', 'checking', 500, 'Chase', true, 0, 'Primary checking'],
  ['Ally HYSA', 'hysa', 2000, 'Ally', true, 1, 'Emergency fund'],
  ['Fidelity Roth IRA', 'roth_ira', 1500, 'Fidelity', true, 2, ''],
  ['Fidelity Brokerage', 'brokerage', 5000, 'Fidelity', true, 3, ''],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(accounts), 'Accounts');

// --- Liabilities sheet ---
const liabilities = [
  ['name*', 'type*', 'balance*', 'apr*', 'minimumPayment*', 'isRevolving*', 'isActive*', 'dueDate', 'notes'],
  ['Chase Sapphire CC', 'credit_card', 450, 0.22, 30, true, true, '2026-05-15', 'Paid in full each cycle'],
  ['Federal Student Loan', 'student_loan', 18000, 0.055, 200, false, true, '', ''],
  ['Auto Loan', 'auto_loan', 12000, 0.065, 250, false, true, '', ''],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(liabilities), 'Liabilities');

// --- Income sheet ---
const income = [
  ['name*', 'sourceType*', 'amount*', 'cadence*', 'depositAccount*', 'isActive*', 'notes'],
  ['Day Job Paycheck', 'paycheck', 2200, 'biweekly', 'Chase Checking', true, '26 paydays/year'],
  ['Freelance', 'side_income', 500, 'irregular', 'Chase Checking', true, 'Logged per gig'],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(income), 'Income');

// --- Expenses sheet ---
const expenses = [
  ['name*', 'category*', 'amount*', 'cadence*', 'paymentMethod*', 'isActive*', 'notes'],
  ['Rent', 'housing', 1400, 'monthly', 'Bank Transfer', true, ''],
  ['Car Insurance', 'insurance', 150, 'monthly', 'Bank Transfer', true, ''],
  ['Student Loan Payment', 'debt', 200, 'monthly', 'Bank Transfer', true, ''],
  ['Auto Loan Payment', 'debt', 250, 'monthly', 'Bank Transfer', true, ''],
  ['Groceries', 'food', 400, 'monthly', 'Credit Card', true, ''],
  ['Gas', 'transportation', 160, 'monthly', 'Credit Card', true, ''],
  ['Utilities', 'housing', 120, 'monthly', 'Credit Card', true, ''],
  ['Netflix', 'subscriptions', 15, 'monthly', 'Credit Card', true, ''],
  ['Gym', 'health', 40, 'monthly', 'Credit Card', true, ''],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expenses), 'Expenses');

// --- Tiers sheet (optional) ---
const tiers = [
  ['priority*', 'name*', 'cap*', 'capType*', 'targetAccount*', 'resetCadence*', 'isActive*', 'notes'],
  [0, 'CC Float Reserve', 0, 'dynamic', 'Chase Checking', 'per_statement', true, 'Suggests CC balance + buffer in checking'],
  [1, 'Emergency Fund', 10000, 'fixed', 'Ally HYSA', 'none', true, 'Fill HYSA to $10,000'],
  [2, 'Roth IRA', 7000, 'fixed', 'Fidelity Roth IRA', 'annual', true, '$7k annual cap'],
  [3, 'Taxable Brokerage', 0, 'unlimited', 'Fidelity Brokerage', 'none', true, 'Catches overflow'],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tiers), 'Tiers');

const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
writeFileSync(outPath, buf);
console.log(`Wrote ${outPath} (${buf.length} bytes)`);
