import type {
  Account, Liability, FixedExpense, Tier, PaycheckEvent, Settings,
  AllocationPlan, TierAllocationPlan, Cadence,
} from '../types';
import { convertCadence, startOfYear } from './dates';

interface AllocatorInputs {
  netPay: number;
  payCadence: Cadence;
  accounts: Account[];
  liabilities: Liability[];
  tiers: Tier[];
  fixedExpenses: FixedExpense[];
  paycheckHistory: PaycheckEvent[];
  settings: Settings;
  now?: Date;
}

/**
 * Compute the period-share of a monthly (or other) expense for this paycheck.
 * E.g. $400 monthly expense on a biweekly paycheck = $400 * 12/26 = $184.62/period
 */
function perPeriodExpense(expense: FixedExpense, payCadence: Cadence): number {
  if (!expense.isActive) return 0;
  return convertCadence(expense.amount, expense.cadence, payCadence);
}

/**
 * Compute YTD contributions to a given account (for annual-reset tiers like Roth)
 */
function ytdContributions(accountName: string, history: PaycheckEvent[], now: Date): number {
  const yearStart = startOfYear(now).getTime();
  return history
    .filter(p => new Date(p.date).getTime() >= yearStart)
    .flatMap(p => p.allocations)
    .filter(a => a.targetAccount === accountName)
    .reduce((sum, a) => sum + a.amount, 0);
}

/**
 * Compute current progress for a tier
 */
function computeTierProgress(
  tier: Tier,
  accounts: Account[],
  liabilities: Liability[],
  history: PaycheckEvent[],
  settings: Settings,
  projectedBalances: Map<string, number>,
  now: Date,
): { progress: number; effectiveCap: number } {
  const targetAccount = accounts.find(a => a.name === tier.targetAccount);
  const projectedBalance = projectedBalances.get(tier.targetAccount)
    ?? targetAccount?.balance ?? 0;

  // Priority 0 = CC Float Reserve (special dynamic)
  if (tier.priority === 0 && tier.capType === 'dynamic') {
    const ccOutstanding = liabilities
      .filter(l => l.isActive && l.type === 'credit_card')
      .reduce((sum, l) => sum + l.balance, 0);
    const effectiveCap = ccOutstanding + settings.ccReserveBuffer;
    const progress = Math.min(projectedBalance, effectiveCap);
    return { progress, effectiveCap };
  }

  // Unlimited tier: cap is effectively infinite, progress = contributions
  if (tier.capType === 'unlimited') {
    const progress = tier.resetCadence === 'annual'
      ? ytdContributions(tier.targetAccount, history, now)
      : projectedBalance;
    return { progress, effectiveCap: Infinity };
  }

  // Annual-reset tier: progress = YTD contributions (not current balance)
  if (tier.resetCadence === 'annual') {
    const progress = Math.min(ytdContributions(tier.targetAccount, history, now), tier.cap);
    return { progress, effectiveCap: tier.cap };
  }

  // Standard fixed tier: progress = min(account balance, cap)
  const progress = Math.min(projectedBalance, tier.cap);
  return { progress, effectiveCap: tier.cap };
}

/**
 * Main allocator: given a paycheck, compute how it cascades through tiers.
 */
export function allocate(inputs: AllocatorInputs): AllocationPlan {
  const { netPay, payCadence, accounts, liabilities, tiers, fixedExpenses, paycheckHistory, settings } = inputs;
  const now = inputs.now ?? new Date();
  const warnings: string[] = [];

  // --- Step 1: Deduct bank-transfer expenses for this pay period ---
  const bankExpensesDetail = fixedExpenses
    .filter(e => e.isActive && e.paymentMethod === 'Bank Transfer')
    .map(e => ({ name: e.name, amount: perPeriodExpense(e, payCadence) }));
  const bankExpensesPaid = bankExpensesDetail.reduce((s, e) => s + e.amount, 0);
  const cashAfterIncomeAndExpenses = netPay - bankExpensesPaid;

  if (cashAfterIncomeAndExpenses < 0) {
    warnings.push(`Paycheck ($${netPay.toFixed(2)}) does not cover bank-transfer expenses ($${bankExpensesPaid.toFixed(2)}). Shortfall of $${(-cashAfterIncomeAndExpenses).toFixed(2)}.`);
  }

  // --- Step 2: Walk tiers in priority order, cascading remaining cash ---
  let allocable = Math.max(0, cashAfterIncomeAndExpenses);
  const projectedBalances = new Map<string, number>();
  accounts.forEach(a => projectedBalances.set(a.name, a.balance));

  const tierPlans: TierAllocationPlan[] = [];
  const sortedTiers = [...tiers].filter(t => t.isActive).sort((a, b) => a.priority - b.priority);

  for (const tier of sortedTiers) {
    const { progress, effectiveCap } = computeTierProgress(
      tier, accounts, liabilities, paycheckHistory, settings, projectedBalances, now,
    );

    const remainingNeed = tier.capType === 'unlimited'
      ? Infinity
      : Math.max(0, effectiveCap - progress);

    const thisAllocation = Math.min(remainingNeed, allocable);
    allocable -= thisAllocation;

    // For tier 0 (reserve), money stays in checking, doesn't transfer.
    // For other tiers, projected balance of target account increases.
    // Tier 0's target IS checking, so either way the math works: we're saying
    // "this much of checking is spoken for as reserve" and the projected balance grows.
    if (tier.priority === 0) {
      const current = projectedBalances.get(tier.targetAccount) ?? 0;
      projectedBalances.set(tier.targetAccount, current + thisAllocation);
    } else if (tier.capType !== 'unlimited') {
      const current = projectedBalances.get(tier.targetAccount) ?? 0;
      projectedBalances.set(tier.targetAccount, current + thisAllocation);
    } else {
      // Unlimited tier — track projected balance too
      const current = projectedBalances.get(tier.targetAccount) ?? 0;
      projectedBalances.set(tier.targetAccount, current + thisAllocation);
    }

    const projectedProgressAfter = tier.capType === 'unlimited'
      ? progress + thisAllocation
      : Math.min(progress + thisAllocation, effectiveCap);

    const pctComplete = tier.capType === 'unlimited'
      ? 0
      : effectiveCap > 0 ? projectedProgressAfter / effectiveCap : 1;

    tierPlans.push({
      tierId: tier.id,
      priority: tier.priority,
      name: tier.name,
      targetAccount: tier.targetAccount,
      capType: tier.capType,
      cap: effectiveCap,
      currentProgress: progress,
      remainingNeed: remainingNeed === Infinity ? 0 : remainingNeed,
      thisAllocation,
      projectedProgressAfter,
      pctComplete,
      isFilled: tier.capType !== 'unlimited' && projectedProgressAfter >= effectiveCap,
    });

    if (allocable <= 0.005) break;
  }

  // --- Step 3: Check for unopened target accounts among tiers that got allocated ---
  for (const plan of tierPlans) {
    if (plan.thisAllocation > 0) {
      const acct = accounts.find(a => a.name === plan.targetAccount);
      if (acct && acct.openedYet === false) {
        warnings.push(`Tier "${plan.name}" wants to deposit to "${plan.targetAccount}" but that account is not opened yet. Open it before moving money.`);
      }
    }
  }

  // --- Step 4: Validate CC runway (uses the primary checking account dynamically) ---
  const primaryChecking = accounts.find(a => a.type === 'checking');
  const ccLiabs = liabilities.filter(l => l.isActive && l.type === 'credit_card');
  for (const cc of ccLiabs) {
    if (!cc.dueDate || !primaryChecking) continue;
    const daysOut = Math.ceil((new Date(cc.dueDate).getTime() - now.getTime()) / 86400000);
    const checkingProjected = projectedBalances.get(primaryChecking.name) ?? 0;
    if (daysOut >= 0 && daysOut <= 14 && checkingProjected < cc.balance) {
      warnings.push(`CC "${cc.name}" is due in ${daysOut} days ($${cc.balance.toFixed(2)}) and projected checking after this paycheck is only $${checkingProjected.toFixed(2)}.`);
    }
  }

  const totalCascaded = tierPlans.reduce((s, p) => s + p.thisAllocation, 0);

  return {
    netPay,
    bankExpensesPaid,
    bankExpensesDetail,
    cashAfterIncomeAndExpenses,
    tiers: tierPlans,
    totalToCascade: Math.max(0, cashAfterIncomeAndExpenses),
    totalCascaded,
    leftover: Math.max(0, cashAfterIncomeAndExpenses - totalCascaded),
    warnings,
  };
}
