import type { Account, Liability, PaycheckEvent, FixedExpense, Cadence } from '../types';
import { convertCadence, startOfYear } from './dates';

export function totalLiquid(accounts: Account[]): number {
  return accounts
    .filter(a => a.type === 'checking' || a.type === 'hysa' || a.type === 'cash')
    .reduce((s, a) => s + a.balance, 0);
}

export function totalInvested(accounts: Account[]): number {
  return accounts
    .filter(a => a.type === 'roth_ira' || a.type === 'brokerage')
    .reduce((s, a) => s + a.balance, 0);
}

export function totalOther(accounts: Account[]): number {
  return accounts
    .filter(a => a.type === 'other')
    .reduce((s, a) => s + a.balance, 0);
}

export function totalAssets(accounts: Account[]): number {
  return accounts.reduce((s, a) => s + a.balance, 0);
}

export function totalDebt(liabilities: Liability[]): number {
  return liabilities
    .filter(l => l.isActive)
    .reduce((s, l) => s + l.balance, 0);
}

export function netWorth(accounts: Account[], liabilities: Liability[]): number {
  return totalAssets(accounts) - totalDebt(liabilities);
}

export function monthlyExpenseTotal(expenses: FixedExpense[]): number {
  return expenses
    .filter(e => e.isActive)
    .reduce((s, e) => s + convertCadence(e.amount, e.cadence, 'monthly'), 0);
}

export function bankExpensesPerPeriod(expenses: FixedExpense[], payCadence: Cadence): number {
  return expenses
    .filter(e => e.isActive && e.paymentMethod === 'Bank Transfer')
    .reduce((s, e) => s + convertCadence(e.amount, e.cadence, payCadence), 0);
}

export function ytdSavings(history: PaycheckEvent[], accounts: Account[], now = new Date()): number {
  const yearStart = startOfYear(now).getTime();
  const checkingNames = new Set(accounts.filter(a => a.type === 'checking').map(a => a.name));
  return history
    .filter(p => new Date(p.date).getTime() >= yearStart)
    .flatMap(p => p.allocations)
    .filter(a => !a.targetAccount || !checkingNames.has(a.targetAccount))
    .reduce((s, a) => s + a.amount, 0);
}

export function ytdGrossNet(history: PaycheckEvent[], now = new Date()): number {
  const yearStart = startOfYear(now).getTime();
  return history
    .filter(p => new Date(p.date).getTime() >= yearStart)
    .reduce((s, p) => s + p.netAmount, 0);
}

export function savingsRateYTD(history: PaycheckEvent[], accounts: Account[], now = new Date()): number {
  const income = ytdGrossNet(history, now);
  if (income <= 0) return 0;
  return ytdSavings(history, accounts, now) / income;
}

/**
 * Project when the current outstanding CC statement can be paid off,
 * given current checking and upcoming paychecks.
 */
export function ccRunway(
  ccBalance: number,
  ccDueDate: string | undefined,
  checkingBalance: number,
  payAmount: number,
  payCadence: Cadence,
  bankExpensesPerPeriod: number,
  now = new Date(),
): { daysUntilDue: number; shortfall: number; paychecksUntilDue: number; onTrack: boolean } {
  if (!ccDueDate) {
    return { daysUntilDue: Infinity, shortfall: 0, paychecksUntilDue: 0, onTrack: true };
  }
  const due = new Date(ccDueDate);
  const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / 86400000);
  const daysPerPeriod = payCadence === 'biweekly' ? 14 : payCadence === 'weekly' ? 7 : 15;
  const paychecksUntilDue = Math.max(0, Math.floor(daysUntilDue / daysPerPeriod));
  const projectedChecking = checkingBalance + paychecksUntilDue * (payAmount - bankExpensesPerPeriod);
  const shortfall = Math.max(0, ccBalance - projectedChecking);
  return {
    daysUntilDue,
    shortfall,
    paychecksUntilDue,
    onTrack: shortfall === 0,
  };
}
