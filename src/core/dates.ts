import type { Cadence } from '../types';

// Average periods per year
const PERIODS_PER_YEAR: Record<Cadence, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
  quarterly: 4,
  annual: 1,
  irregular: 0,
};

export function toAnnual(amount: number, cadence: Cadence): number {
  if (cadence === 'irregular') return 0;
  return amount * PERIODS_PER_YEAR[cadence];
}

export function fromAnnualTo(annualAmount: number, cadence: Cadence): number {
  if (cadence === 'irregular') return 0;
  return annualAmount / PERIODS_PER_YEAR[cadence];
}

// Convert an amount from one cadence to another
export function convertCadence(amount: number, from: Cadence, to: Cadence): number {
  return fromAnnualTo(toAnnual(amount, from), to);
}

// Start of calendar year for date
export function startOfYear(date = new Date()): Date {
  return new Date(date.getFullYear(), 0, 1);
}

// Format currency
export function fmt(amount: number, opts?: { showCents?: boolean; showSign?: boolean }): string {
  const showCents = opts?.showCents ?? true;
  const showSign = opts?.showSign ?? false;
  const abs = Math.abs(amount);
  const s = abs.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });
  if (amount < 0) return `-${s}`;
  if (showSign && amount > 0) return `+${s}`;
  return s;
}

export function fmtDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function daysUntil(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  const ms = d.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
