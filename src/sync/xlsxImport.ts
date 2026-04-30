import { db } from '../db';
import type {
  Account, Liability, IncomeSource, FixedExpense, Tier,
  AccountType, LiabilityType, IncomeType, ExpenseCategory, Cadence, PaymentMethod, CapType, ResetCadence,
} from '../types';

export interface RowError {
  sheet: string;
  row: number;
  message: string;
}

type Maybe<T> = Omit<T, 'id'>;

export interface ImportPreview {
  accounts: { valid: Maybe<Account>[]; errors: RowError[] };
  liabilities: { valid: Maybe<Liability>[]; errors: RowError[] };
  incomeSources: { valid: Maybe<IncomeSource>[]; errors: RowError[] };
  fixedExpenses: { valid: Maybe<FixedExpense>[]; errors: RowError[] };
  tiers: { valid: Maybe<Tier>[]; errors: RowError[] };
  hardErrors: RowError[];
}

const ACCOUNT_TYPES: AccountType[] = ['checking', 'hysa', 'roth_ira', 'brokerage', 'cash', 'other'];
const LIABILITY_TYPES: LiabilityType[] = ['credit_card', 'student_loan', 'auto_loan', 'personal_loan', 'other'];
const INCOME_TYPES: IncomeType[] = ['paycheck', 'bonus', 'gift', 'reimbursement', 'side_income', 'other'];
const CATEGORIES: ExpenseCategory[] = ['housing', 'food', 'transportation', 'insurance', 'debt', 'subscriptions', 'entertainment', 'health', 'misc'];
const CADENCES: Cadence[] = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'annual', 'irregular'];
const PAYMENT_METHODS: PaymentMethod[] = ['Bank Transfer', 'Credit Card', 'Cash', 'Autopay', 'Other'];
const CAP_TYPES: CapType[] = ['fixed', 'dynamic', 'unlimited'];
const RESET_CADENCES: ResetCadence[] = ['none', 'annual', 'monthly', 'per_statement'];

function normHeader(s: any): string {
  return String(s ?? '').toLowerCase().trim().replace(/\*+$/, '').trim();
}

function isBlank(v: any): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function asString(v: any): string {
  return String(v ?? '').trim();
}

function asNumber(v: any): number | null {
  if (isBlank(v)) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function asBoolean(v: any): boolean | null {
  if (typeof v === 'boolean') return v;
  if (isBlank(v)) return null;
  const s = String(v).toLowerCase().trim();
  if (['true', 'yes', '1', 'y', 't'].includes(s)) return true;
  if (['false', 'no', '0', 'n', 'f'].includes(s)) return false;
  return null;
}

function asEnum<T extends string>(v: any, allowed: readonly T[]): T | null {
  if (isBlank(v)) return null;
  // Case-insensitive match against allowed list, then return canonical casing
  const target = String(v).toLowerCase().trim();
  for (const a of allowed) {
    if (a.toLowerCase() === target) return a;
  }
  return null;
}

function asISODate(v: any): string | null {
  if (isBlank(v)) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

interface SheetRows {
  headers: string[];
  data: any[][];
}

// Convert the raw [headers, ...rows] grid into a record-friendly structure.
// Scans for the first row that contains AT LEAST TWO of the expected header
// names — this skips the "KEY" legend block at the top of each sheet, where
// each legend row only contains a single field name in column A (so it never
// matches the multi-header threshold).
//
// Data rows missing the row's identifier column (`expectedHeaders[0]`) are
// also dropped so trailing blank/legend rows below the table don't show up
// as "row X is invalid" errors.
function shape(grid: any[][] | undefined, expectedHeaders: string[]): SheetRows | null {
  if (!grid || grid.length === 0) return null;
  const targets = expectedHeaders.map(h => h.toLowerCase());
  const idHeader = targets[0];
  let headerIdx = -1;
  for (let i = 0; i < grid.length; i++) {
    const headers = (grid[i] ?? []).map(normHeader);
    const matches = targets.filter(t => headers.includes(t)).length;
    // Real header rows contain ALL expected headers; legend rows have at most one.
    // Threshold of 2 is enough to disambiguate without being brittle.
    if (matches >= 2) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return null;
  const headers = grid[headerIdx].map(normHeader);
  const reqIdx = headers.indexOf(idHeader);
  const data = grid.slice(headerIdx + 1).filter(row => !isBlank(row[reqIdx]));
  return { headers, data };
}

function getCell(row: any[], headers: string[], name: string): any {
  const idx = headers.indexOf(name);
  return idx === -1 ? undefined : row[idx];
}

const TODAY = (): string => new Date().toISOString().slice(0, 10);

export async function parseXlsx(file: File): Promise<ImportPreview> {
  // Lazy-import so the parser bytes only load when the user actually picks a file.
  const mod = await import('read-excel-file/browser');
  const readXlsxFile = mod.default;

  // Returns Sheet[] — { sheet: string, data: Row[] }
  const allSheets = await readXlsxFile(file);
  const byName: Record<string, any[][]> = {};
  for (const s of allSheets as unknown as Array<{ sheet: string; data: any[][] }>) {
    byName[s.sheet] = s.data;
  }
  // Look up case-insensitive
  const findSheet = (name: string): any[][] | undefined => {
    const target = name.toLowerCase();
    for (const k of Object.keys(byName)) {
      if (k.toLowerCase() === target) return byName[k];
    }
    return undefined;
  };
  const grids = {
    Accounts: findSheet('Accounts'),
    Liabilities: findSheet('Liabilities'),
    Income: findSheet('Income'),
    Expenses: findSheet('Expenses'),
    Tiers: findSheet('Tiers'),
  } as Record<string, any[][] | undefined>;

  const preview: ImportPreview = {
    accounts: { valid: [], errors: [] },
    liabilities: { valid: [], errors: [] },
    incomeSources: { valid: [], errors: [] },
    fixedExpenses: { valid: [], errors: [] },
    tiers: { valid: [], errors: [] },
    hardErrors: [],
  };

  // --- Accounts ---
  const accountsSheet = shape(grids.Accounts, ['name', 'type', 'balance']);
  if (!accountsSheet) {
    preview.hardErrors.push({ sheet: 'Accounts', row: 0, message: 'Required sheet "Accounts" is missing or empty.' });
  } else {
    accountsSheet.data.forEach((row, i) => {
      const rowNum = i + 2; // +1 for header, +1 for 1-based
      const name = asString(getCell(row, accountsSheet.headers, 'name'));
      const typeRaw = getCell(row, accountsSheet.headers, 'type');
      const balance = asNumber(getCell(row, accountsSheet.headers, 'balance'));
      const errors: string[] = [];
      if (!name) errors.push('name is required');
      const type = asEnum(typeRaw, ACCOUNT_TYPES);
      if (!type) errors.push(`type must be one of: ${ACCOUNT_TYPES.join(', ')}`);
      if (balance === null) errors.push('balance must be a number');
      if (errors.length) {
        preview.accounts.errors.push({ sheet: 'Accounts', row: rowNum, message: errors.join('; ') });
        return;
      }
      const openedRaw = getCell(row, accountsSheet.headers, 'openedyet');
      const sortRaw = getCell(row, accountsSheet.headers, 'sortorder');
      preview.accounts.valid.push({
        name,
        type: type!,
        balance: balance!,
        institution: asString(getCell(row, accountsSheet.headers, 'institution')),
        lastUpdated: TODAY(),
        openedYet: asBoolean(openedRaw) ?? true,
        sortOrder: asNumber(sortRaw) ?? i,
        notes: asString(getCell(row, accountsSheet.headers, 'notes')) || undefined,
      });
    });
  }

  const accountNames = new Set(preview.accounts.valid.map(a => a.name));

  // --- Liabilities ---
  const liabSheet = shape(grids.Liabilities, ['name', 'type', 'balance', 'apr']);
  if (liabSheet) {
    liabSheet.data.forEach((row, i) => {
      const rowNum = i + 2;
      const name = asString(getCell(row, liabSheet.headers, 'name'));
      const type = asEnum(getCell(row, liabSheet.headers, 'type'), LIABILITY_TYPES);
      const balance = asNumber(getCell(row, liabSheet.headers, 'balance'));
      const apr = asNumber(getCell(row, liabSheet.headers, 'apr'));
      const minPay = asNumber(getCell(row, liabSheet.headers, 'minimumpayment'));
      const isRevolving = asBoolean(getCell(row, liabSheet.headers, 'isrevolving'));
      const isActive = asBoolean(getCell(row, liabSheet.headers, 'isactive'));
      const errors: string[] = [];
      if (!name) errors.push('name is required');
      if (!type) errors.push(`type must be one of: ${LIABILITY_TYPES.join(', ')}`);
      if (balance === null) errors.push('balance must be a number');
      if (apr === null) errors.push('apr must be a number (e.g. 0.22 for 22%)');
      if (minPay === null) errors.push('minimumPayment must be a number');
      if (isRevolving === null) errors.push('isRevolving must be true or false');
      if (isActive === null) errors.push('isActive must be true or false');
      if (errors.length) {
        preview.liabilities.errors.push({ sheet: 'Liabilities', row: rowNum, message: errors.join('; ') });
        return;
      }
      preview.liabilities.valid.push({
        name,
        type: type!,
        balance: balance!,
        apr: apr!,
        minimumPayment: minPay!,
        dueDate: asISODate(getCell(row, liabSheet.headers, 'duedate')) || undefined,
        isRevolving: isRevolving!,
        isActive: isActive!,
        notes: asString(getCell(row, liabSheet.headers, 'notes')) || undefined,
      });
    });
  }

  // --- Income ---
  const incomeSheet = shape(grids.Income, ['name', 'sourcetype', 'amount', 'cadence', 'depositaccount']);
  if (incomeSheet) {
    incomeSheet.data.forEach((row, i) => {
      const rowNum = i + 2;
      const name = asString(getCell(row, incomeSheet.headers, 'name'));
      const sourceType = asEnum(getCell(row, incomeSheet.headers, 'sourcetype'), INCOME_TYPES);
      const amount = asNumber(getCell(row, incomeSheet.headers, 'amount'));
      const cadence = asEnum(getCell(row, incomeSheet.headers, 'cadence'), CADENCES);
      const depositAccount = asString(getCell(row, incomeSheet.headers, 'depositaccount'));
      const isActive = asBoolean(getCell(row, incomeSheet.headers, 'isactive'));
      const errors: string[] = [];
      if (!name) errors.push('name is required');
      if (!sourceType) errors.push(`sourceType must be one of: ${INCOME_TYPES.join(', ')}`);
      if (amount === null) errors.push('amount must be a number');
      if (!cadence) errors.push(`cadence must be one of: ${CADENCES.join(', ')}`);
      if (!depositAccount) errors.push('depositAccount is required');
      else if (!accountNames.has(depositAccount)) errors.push(`depositAccount "${depositAccount}" does not match any Accounts.name in this file`);
      if (isActive === null) errors.push('isActive must be true or false');
      if (errors.length) {
        preview.incomeSources.errors.push({ sheet: 'Income', row: rowNum, message: errors.join('; ') });
        return;
      }
      preview.incomeSources.valid.push({
        name,
        sourceType: sourceType!,
        amount: amount!,
        cadence: cadence!,
        depositAccount,
        isActive: isActive!,
        notes: asString(getCell(row, incomeSheet.headers, 'notes')) || undefined,
      });
    });
  }

  // --- Expenses ---
  const expSheet = shape(grids.Expenses, ['name', 'category', 'amount', 'cadence', 'paymentmethod']);
  if (expSheet) {
    expSheet.data.forEach((row, i) => {
      const rowNum = i + 2;
      const name = asString(getCell(row, expSheet.headers, 'name'));
      const category = asEnum(getCell(row, expSheet.headers, 'category'), CATEGORIES);
      const amount = asNumber(getCell(row, expSheet.headers, 'amount'));
      const cadence = asEnum(getCell(row, expSheet.headers, 'cadence'), CADENCES);
      const paymentMethod = asEnum(getCell(row, expSheet.headers, 'paymentmethod'), PAYMENT_METHODS);
      const isActive = asBoolean(getCell(row, expSheet.headers, 'isactive'));
      const errors: string[] = [];
      if (!name) errors.push('name is required');
      if (!category) errors.push(`category must be one of: ${CATEGORIES.join(', ')}`);
      if (amount === null) errors.push('amount must be a number');
      if (!cadence) errors.push(`cadence must be one of: ${CADENCES.join(', ')}`);
      if (!paymentMethod) errors.push(`paymentMethod must be one of: ${PAYMENT_METHODS.join(', ')}`);
      if (isActive === null) errors.push('isActive must be true or false');
      if (errors.length) {
        preview.fixedExpenses.errors.push({ sheet: 'Expenses', row: rowNum, message: errors.join('; ') });
        return;
      }
      preview.fixedExpenses.valid.push({
        name,
        category: category!,
        amount: amount!,
        cadence: cadence!,
        paymentMethod: paymentMethod!,
        isActive: isActive!,
        notes: asString(getCell(row, expSheet.headers, 'notes')) || undefined,
      });
    });
  }

  // --- Tiers (optional) ---
  const tierSheet = shape(grids.Tiers, ['name', 'priority', 'cap', 'captype', 'targetaccount']);
  if (tierSheet) {
    tierSheet.data.forEach((row, i) => {
      const rowNum = i + 2;
      const priority = asNumber(getCell(row, tierSheet.headers, 'priority'));
      const name = asString(getCell(row, tierSheet.headers, 'name'));
      const cap = asNumber(getCell(row, tierSheet.headers, 'cap'));
      const capType = asEnum(getCell(row, tierSheet.headers, 'captype'), CAP_TYPES);
      const targetAccount = asString(getCell(row, tierSheet.headers, 'targetaccount'));
      const resetCadence = asEnum(getCell(row, tierSheet.headers, 'resetcadence'), RESET_CADENCES);
      const isActive = asBoolean(getCell(row, tierSheet.headers, 'isactive'));
      const errors: string[] = [];
      if (priority === null) errors.push('priority must be a number');
      if (!name) errors.push('name is required');
      if (cap === null) errors.push('cap must be a number');
      if (!capType) errors.push(`capType must be one of: ${CAP_TYPES.join(', ')}`);
      if (!targetAccount) errors.push('targetAccount is required');
      else if (!accountNames.has(targetAccount)) errors.push(`targetAccount "${targetAccount}" does not match any Accounts.name in this file`);
      if (!resetCadence) errors.push(`resetCadence must be one of: ${RESET_CADENCES.join(', ')}`);
      if (isActive === null) errors.push('isActive must be true or false');
      if (errors.length) {
        preview.tiers.errors.push({ sheet: 'Tiers', row: rowNum, message: errors.join('; ') });
        return;
      }
      preview.tiers.valid.push({
        priority: priority!,
        name,
        cap: cap!,
        capType: capType!,
        targetAccount,
        resetCadence: resetCadence!,
        isActive: isActive!,
        notes: asString(getCell(row, tierSheet.headers, 'notes')) || undefined,
      });
    });
  }

  return preview;
}

export function hasErrors(preview: ImportPreview): boolean {
  return preview.hardErrors.length > 0
    || preview.accounts.errors.length > 0
    || preview.liabilities.errors.length > 0
    || preview.incomeSources.errors.length > 0
    || preview.fixedExpenses.errors.length > 0
    || preview.tiers.errors.length > 0;
}

export async function commitImport(preview: ImportPreview): Promise<void> {
  await db.transaction(
    'rw',
    [db.accounts, db.liabilities, db.incomeSources, db.fixedExpenses,
     db.tiers, db.paycheckEvents, db.netWorthSnapshots, db.settings, db.meta],
    async () => {
      await Promise.all([
        db.accounts.clear(), db.liabilities.clear(), db.incomeSources.clear(),
        db.fixedExpenses.clear(), db.tiers.clear(), db.paycheckEvents.clear(),
        db.netWorthSnapshots.clear(), db.settings.clear(),
      ]);
      if (preview.accounts.valid.length) await db.accounts.bulkAdd(preview.accounts.valid as Account[]);
      if (preview.liabilities.valid.length) await db.liabilities.bulkAdd(preview.liabilities.valid as Liability[]);
      if (preview.incomeSources.valid.length) await db.incomeSources.bulkAdd(preview.incomeSources.valid as IncomeSource[]);
      if (preview.fixedExpenses.valid.length) await db.fixedExpenses.bulkAdd(preview.fixedExpenses.valid as FixedExpense[]);
      if (preview.tiers.valid.length) await db.tiers.bulkAdd(preview.tiers.valid as Tier[]);
      // Default settings (matches the seed defaults — user can edit afterwards)
      await db.settings.put({
        id: 1,
        ccReserveBuffer: 100,
        rothContributionYear: new Date().getFullYear(),
        rothAnnualCap: 7000,
        targetSavingsRate: 0.3,
        defaultCadence: 'biweekly',
      });
      // Clear the wiped flag so subsequent reloads behave normally.
      await db.meta.delete('wiped');
    },
  );
}
