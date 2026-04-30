import { db } from './schema';
import type {
  Account, Liability, IncomeSource, FixedExpense, Tier, Settings,
} from '../types';

// Simulation dataset — realistic mid-career engineer with biweekly paychecks,
// a small CC balance, a student loan, an auto loan, and a mix of investment accounts.
// Designed to exercise every code path: bank-transfer reserve, CC runway warning,
// tier suggestion waterfall, Other-type account in Net Worth, sortOrder on Payday.

const TODAY = new Date().toISOString().slice(0, 10);

// Upcoming CC due date — ~3 weeks out from today so runway warning has signal but isn't urgent.
const ccDue = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 21);
  return d.toISOString().slice(0, 10);
})();

const seedAccounts: Omit<Account, 'id'>[] = [
  { name: 'Chase Checking', institution: 'Chase', type: 'checking', balance: 500, lastUpdated: TODAY, openedYet: true, sortOrder: 0, notes: 'Primary checking — receives paychecks, pays bank-transfer expenses' },
  { name: 'Ally HYSA', institution: 'Ally', type: 'hysa', balance: 2000, lastUpdated: TODAY, openedYet: true, sortOrder: 1, notes: 'Emergency fund target $10,000' },
  { name: 'Fidelity Roth IRA', institution: 'Fidelity', type: 'roth_ira', balance: 1500, lastUpdated: TODAY, openedYet: true, sortOrder: 2, notes: 'YTD contributions toward $7,000 annual cap' },
  { name: 'Fidelity Brokerage', institution: 'Fidelity', type: 'brokerage', balance: 5000, lastUpdated: TODAY, openedYet: true, sortOrder: 3, notes: 'Taxable long-term investing' },
  { name: 'Robinhood', institution: 'Robinhood', type: 'other', balance: 750, lastUpdated: TODAY, openedYet: true, sortOrder: 4, notes: 'Miscellaneous trading account — counted in Other on Dashboard' },
];

const seedLiabilities: Omit<Liability, 'id'>[] = [
  { name: 'Chase Sapphire CC', type: 'credit_card', balance: 450, apr: 0.22, minimumPayment: 30, dueDate: ccDue, isRevolving: true, isActive: true, notes: 'Paid in full each cycle' },
  { name: 'Federal Student Loan', type: 'student_loan', balance: 18000, apr: 0.055, minimumPayment: 200, isRevolving: false, isActive: true, notes: 'Fixed $200/mo via auto-pay' },
  { name: 'Auto Loan', type: 'auto_loan', balance: 12000, apr: 0.065, minimumPayment: 250, isRevolving: false, isActive: true, notes: 'Fixed $250/mo via auto-pay' },
];

const seedIncome: Omit<IncomeSource, 'id'>[] = [
  { name: 'Infor Paycheck', sourceType: 'paycheck', amount: 2200, cadence: 'biweekly', depositAccount: 'Chase Checking', isActive: true, notes: 'Net after federal/state/401k. 26 paydays/year.' },
  { name: 'Freelance Side Gig', sourceType: 'side_income', amount: 500, cadence: 'irregular', depositAccount: 'Chase Checking', isActive: true, notes: 'Ad-hoc consulting. Log per event.' },
];

const seedExpenses: Omit<FixedExpense, 'id'>[] = [
  // Bank-Transfer — these drive the per-paycheck checking reserve (~$923/biweekly)
  { name: 'Rent', category: 'housing', amount: 1400, cadence: 'monthly', paymentMethod: 'Bank Transfer', isActive: true, notes: 'Auto-debit on the 1st' },
  { name: 'Car Insurance', category: 'insurance', amount: 150, cadence: 'monthly', paymentMethod: 'Bank Transfer', isActive: true, notes: '' },
  { name: 'Student Loan Payment', category: 'debt', amount: 200, cadence: 'monthly', paymentMethod: 'Bank Transfer', isActive: true, notes: 'Fixed minimum' },
  { name: 'Auto Loan Payment', category: 'debt', amount: 250, cadence: 'monthly', paymentMethod: 'Bank Transfer', isActive: true, notes: 'Fixed minimum' },
  // Credit-Card — these grow the CC balance, not checking
  { name: 'Groceries', category: 'food', amount: 400, cadence: 'monthly', paymentMethod: 'Credit Card', isActive: true, notes: '~$100/week' },
  { name: 'Gas', category: 'transportation', amount: 160, cadence: 'monthly', paymentMethod: 'Credit Card', isActive: true, notes: '' },
  { name: 'Utilities', category: 'housing', amount: 120, cadence: 'monthly', paymentMethod: 'Credit Card', isActive: true, notes: 'Electric + internet' },
  { name: 'Netflix', category: 'subscriptions', amount: 15, cadence: 'monthly', paymentMethod: 'Credit Card', isActive: true, notes: '' },
  { name: 'Gym', category: 'health', amount: 40, cadence: 'monthly', paymentMethod: 'Credit Card', isActive: true, notes: '' },
];

const seedTiers: Omit<Tier, 'id'>[] = [
  { priority: 0, name: 'CC Float Reserve', cap: 0, capType: 'dynamic', targetAccount: 'Chase Checking', resetCadence: 'per_statement', isActive: true, notes: 'Suggests keeping CC balance + buffer in checking' },
  { priority: 1, name: 'Emergency Fund', cap: 10000, capType: 'fixed', targetAccount: 'Ally HYSA', resetCadence: 'none', isActive: true, notes: 'Fill HYSA to $10,000 (~5 months of expenses)' },
  { priority: 2, name: 'Roth IRA', cap: 7000, capType: 'fixed', targetAccount: 'Fidelity Roth IRA', resetCadence: 'annual', isActive: true, notes: '$7,000 annual cap, resets Jan 1' },
  { priority: 3, name: 'Taxable Brokerage', cap: 0, capType: 'unlimited', targetAccount: 'Fidelity Brokerage', resetCadence: 'none', isActive: true, notes: 'Catches all overflow' },
];

const seedSettings: Settings = {
  id: 1,
  ccReserveBuffer: 100,
  rothContributionYear: 2026,
  rothAnnualCap: 7000,
  targetSavingsRate: 0.3,
  defaultCadence: 'biweekly',
};

export async function isFirstLaunch(): Promise<boolean> {
  const wiped = await db.meta.get('wiped');
  if (wiped?.value === true) return false;
  const count = await db.accounts.count();
  return count === 0;
}

export async function wipeDatabase(): Promise<void> {
  await db.transaction(
    'rw',
    [db.accounts, db.liabilities, db.incomeSources, db.fixedExpenses, db.tiers,
     db.paycheckEvents, db.netWorthSnapshots, db.settings, db.meta],
    async () => {
      await Promise.all([
        db.accounts.clear(), db.liabilities.clear(), db.incomeSources.clear(),
        db.fixedExpenses.clear(), db.tiers.clear(), db.paycheckEvents.clear(),
        db.netWorthSnapshots.clear(), db.settings.clear(),
      ]);
      await db.meta.put({ key: 'wiped', value: true });
      await db.settings.put({
        id: 1,
        ccReserveBuffer: 0,
        rothContributionYear: new Date().getFullYear(),
        rothAnnualCap: 7000,
        targetSavingsRate: 0.2,
        defaultCadence: 'biweekly',
      });
    },
  );
}

export async function seedDatabase(): Promise<void> {
  await db.transaction(
    'rw',
    [db.accounts, db.liabilities, db.incomeSources, db.fixedExpenses, db.tiers, db.settings, db.meta],
    async () => {
      const existing = await db.accounts.count();
      if (existing > 0) return;

      await db.accounts.bulkAdd(seedAccounts as Account[]);
      await db.liabilities.bulkAdd(seedLiabilities as Liability[]);
      await db.incomeSources.bulkAdd(seedIncome as IncomeSource[]);
      await db.fixedExpenses.bulkAdd(seedExpenses as FixedExpense[]);
      await db.tiers.bulkAdd(seedTiers as Tier[]);
      await db.settings.put(seedSettings);
      // Clear the "wiped" flag so seeding works as expected on future loads
      await db.meta.delete('wiped');
    },
  );
}

export async function resetDatabase(): Promise<void> {
  await db.transaction(
    'rw',
    [db.accounts, db.liabilities, db.incomeSources, db.fixedExpenses, db.tiers,
     db.paycheckEvents, db.netWorthSnapshots, db.settings, db.meta],
    async () => {
      await Promise.all([
        db.accounts.clear(), db.liabilities.clear(), db.incomeSources.clear(),
        db.fixedExpenses.clear(), db.tiers.clear(), db.paycheckEvents.clear(),
        db.netWorthSnapshots.clear(), db.settings.clear(), db.meta.clear(),
      ]);
    },
  );
  await seedDatabase();
}
