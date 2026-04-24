// Core domain types

export type AccountType = 'checking' | 'hysa' | 'roth_ira' | 'brokerage' | 'cash' | 'other';
export type LiabilityType = 'credit_card' | 'student_loan' | 'auto_loan' | 'personal_loan' | 'other';
export type IncomeType = 'paycheck' | 'bonus' | 'gift' | 'reimbursement' | 'side_income' | 'other';
export type ExpenseCategory = 'housing' | 'food' | 'transportation' | 'insurance' | 'debt' | 'subscriptions' | 'entertainment' | 'health' | 'misc';
export type Cadence = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly' | 'annual' | 'irregular';
export type PaymentMethod = 'Bank Transfer' | 'Credit Card' | 'Cash' | 'Autopay' | 'Other';
export type CapType = 'fixed' | 'dynamic' | 'unlimited';
export type ResetCadence = 'none' | 'annual' | 'monthly' | 'per_statement';

export interface Account {
  id: number;
  name: string;
  institution: string;
  type: AccountType;
  balance: number;
  lastUpdated: string; // ISO date
  notes?: string;
  openedYet?: boolean; // false means "need to open"
  sortOrder?: number;
}

export interface Liability {
  id: number;
  name: string;
  type: LiabilityType;
  balance: number;
  apr: number; // 0-1
  minimumPayment: number;
  dueDate?: string; // ISO date of next due
  isRevolving: boolean;
  isActive: boolean;
  notes?: string;
}

export interface IncomeSource {
  id: number;
  name: string;
  sourceType: IncomeType;
  amount: number; // per-period
  cadence: Cadence;
  depositAccount: string; // account name
  isActive: boolean;
  notes?: string;
}

export interface FixedExpense {
  id: number;
  name: string;
  category: ExpenseCategory;
  amount: number;
  cadence: Cadence;
  paymentMethod: PaymentMethod;
  isActive: boolean;
  notes?: string;
}

export interface Tier {
  id: number;
  priority: number;
  name: string;
  cap: number;
  capType: CapType;
  targetAccount: string; // account name
  resetCadence: ResetCadence;
  isActive: boolean;
  notes?: string;
}

export interface PaycheckEvent {
  id: number;
  date: string; // ISO
  source: string;
  grossAmount?: number;
  netAmount: number;
  allocations: Allocation[];
  bankExpensesPaid: number;
  notes?: string;
}

export interface Allocation {
  // Exactly one of targetAccount / targetLiability is set.
  targetAccount?: string;
  targetLiability?: string;
  liabilityId?: number;
  amount: number;
  tierId?: number;
  tierName?: string;
}

export interface NetWorthSnapshot {
  id: number;
  date: string; // ISO
  totalLiquid: number;
  totalInvested: number;
  totalDebt: number;
  totalCreditCard?: number;
  netWorth: number;
  notes?: string;
}

export interface Settings {
  id: number; // always 1
  ccReserveBuffer: number;
  rothContributionYear: number;
  rothAnnualCap: number;
  targetSavingsRate: number;
  defaultCadence: Cadence;
  fileHandleStored: boolean; // whether user has picked a file
}

// Allocator output types

export interface AllocationPlan {
  netPay: number;
  bankExpensesPaid: number;
  bankExpensesDetail: { name: string; amount: number }[];
  cashAfterIncomeAndExpenses: number;
  tiers: TierAllocationPlan[];
  totalToCascade: number;
  totalCascaded: number;
  leftover: number;
  warnings: string[];
}

export interface TierAllocationPlan {
  tierId: number;
  priority: number;
  name: string;
  targetAccount: string;
  capType: CapType;
  cap: number;
  currentProgress: number;
  remainingNeed: number;
  thisAllocation: number;
  projectedProgressAfter: number;
  pctComplete: number;
  isFilled: boolean;
}
