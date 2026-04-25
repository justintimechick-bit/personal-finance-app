import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { allocate } from '../core/allocator';
import { bankExpensesPerPeriod } from '../core/calc';
import { fmtDate } from '../core/dates';
import { Money, Section, CurrencyInput } from '../components/UI';
import { useAppUI } from '../store/useAppStore';
import { scheduleAutoSave } from '../sync/fileSync';
import type { PaycheckEvent, Cadence, Allocation } from '../types';

export default function Payday() {
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const liabilities = useLiveQuery(() => db.liabilities.toArray(), []);
  const incomeSources = useLiveQuery(() => db.incomeSources.toArray(), []);
  const expenses = useLiveQuery(() => db.fixedExpenses.toArray(), []);
  const tiers = useLiveQuery(() => db.tiers.toArray(), []);
  const history = useLiveQuery(() => db.paycheckEvents.toArray(), []);
  const settings = useLiveQuery(() => db.settings.get(1), []);

  const [sourceId, setSourceId] = useState<number | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>('');
  const [splits, setSplits] = useState<Record<number, number>>({});
  const [liabilitySplits, setLiabilitySplits] = useState<Record<number, number>>({});
  const [expandedHistory, setExpandedHistory] = useState<Set<number>>(new Set());
  const { showToast } = useAppUI();

  const activeSources = (incomeSources ?? []).filter(s => s.isActive);
  const selectedSource = activeSources.find(s => s.id === sourceId) ?? activeSources.find(s => s.sourceType === 'paycheck') ?? activeSources[0];
  const effectiveAmount = amount > 0 ? amount : selectedSource?.amount ?? 0;
  const effectiveCadence: Cadence = selectedSource?.cadence ?? 'biweekly';

  const openedAccounts = (accounts ?? [])
    .filter(a => a.openedYet)
    .slice()
    .sort((a, b) => {
      const ao = a.sortOrder ?? 1e9;
      const bo = b.sortOrder ?? 1e9;
      if (ao !== bo) return ao - bo;
      return a.id - b.id;
    });
  const primaryChecking = (accounts ?? []).find(a => a.type === 'checking');
  const checkingReserve = bankExpensesPerPeriod(expenses ?? [], effectiveCadence);

  const suggested = useMemo(() => {
    if (!accounts || !liabilities || !tiers || !expenses || !history || !settings) return new Map<string, number>();
    const plan = allocate({
      netPay: effectiveAmount,
      payCadence: effectiveCadence,
      accounts, liabilities, tiers, fixedExpenses: expenses,
      paycheckHistory: history,
      settings,
      now: new Date(date),
    });
    const m = new Map<string, number>();
    for (const t of plan.tiers) {
      m.set(t.targetAccount, (m.get(t.targetAccount) ?? 0) + t.thisAllocation);
    }
    // Add the bank-transfer reserve to the primary checking account so that the
    // "Suggested" hint represents the full amount the user should put into checking
    // (reserve for outgoing bank transfers + any tier 0 top-up).
    const checking = accounts.find(a => a.type === 'checking');
    if (checking) {
      m.set(checking.name, (m.get(checking.name) ?? 0) + plan.bankExpensesPaid);
    }
    return m;
  }, [accounts, liabilities, tiers, expenses, history, settings, effectiveAmount, effectiveCadence, date]);

  // Pre-fill: checking gets the bank-expense amount, everything else stays blank.
  // Re-runs when the selected source (thus cadence, thus reserve) changes, or when
  // primary checking is first discovered.
  useEffect(() => {
    if (!primaryChecking) return;
    setSplits(prev => ({ ...prev, [primaryChecking.id]: Math.round(checkingReserve * 100) / 100 }));
  }, [primaryChecking?.id, checkingReserve]);

  if (!accounts || !liabilities || !incomeSources || !expenses || !tiers || !history || !settings) {
    return <div className="text-ink-300">Loading…</div>;
  }

  const accountAllocated = Object.values(splits).reduce((s, v) => s + (v || 0), 0);
  const liabilityAllocated = Object.values(liabilitySplits).reduce((s, v) => s + (v || 0), 0);
  const allocated = accountAllocated + liabilityAllocated;
  const remaining = effectiveAmount - allocated;
  const activeLiabilities = liabilities?.filter(l => l.isActive && l.balance > 0.005) ?? [];
  const canApply = !!selectedSource && effectiveAmount > 0 && Math.abs(remaining) < 0.01;

  const warnings: string[] = [];
  if (remaining < -0.005) warnings.push(`Over-allocated by ${fmtMoney(Math.abs(remaining))}. Reduce one of the rows below before applying.`);
  if (remaining > 0.005) warnings.push(`${fmtMoney(remaining)} left to allocate. Assign every dollar before applying.`);
  if (primaryChecking && (splits[primaryChecking.id] ?? 0) < checkingReserve - 0.005) {
    warnings.push(`Checking is below the bank-transfer reserve (${fmtMoney(checkingReserve)} needed for this period's auto-pays). Student loan / car insurance may bounce.`);
  }
  // Guard against over-paying a liability (would push balance negative)
  for (const l of activeLiabilities) {
    const pay = liabilitySplits[l.id] ?? 0;
    if (pay > l.balance + 0.005) {
      warnings.push(`Paydown for "${l.name}" (${fmtMoney(pay)}) exceeds the current balance (${fmtMoney(l.balance)}). Reduce to at most the outstanding amount.`);
    }
  }
  // CC runway warning: if a CC is due soon and projected checking after this paycheck can't cover it
  const cc = liabilities.find(l => l.isActive && l.type === 'credit_card' && l.dueDate);
  if (cc && primaryChecking) {
    const daysOut = Math.ceil((new Date(cc.dueDate!).getTime() - new Date(date).getTime()) / 86400000);
    const projectedChecking = primaryChecking.balance + (splits[primaryChecking.id] ?? 0) - checkingReserve;
    if (daysOut >= 0 && daysOut <= 14 && projectedChecking < cc.balance) {
      warnings.push(`CC "${cc.name}" due in ${daysOut} days (${fmtMoney(cc.balance)}). Projected checking after bank transfers: ${fmtMoney(projectedChecking)}. Consider increasing the checking row.`);
    }
  }

  function setSplit(accountId: number, value: number) {
    setSplits(prev => ({ ...prev, [accountId]: value }));
  }

  function setLiabilitySplit(liabilityId: number, value: number) {
    setLiabilitySplits(prev => ({ ...prev, [liabilityId]: value }));
  }

  function useSuggested(accountName: string, accountId: number) {
    const s = suggested.get(accountName) ?? 0;
    setSplit(accountId, Math.round(s * 100) / 100);
  }

  function applySuggestedToAll() {
    const next: Record<number, number> = {};
    for (const a of openedAccounts) {
      const s = suggested.get(a.name) ?? 0;
      next[a.id] = Math.round(s * 100) / 100;
    }
    setSplits(next);
  }

  function clearAll() {
    const next: Record<number, number> = {};
    if (primaryChecking) next[primaryChecking.id] = Math.round(checkingReserve * 100) / 100;
    setSplits(next);
    setLiabilitySplits({});
  }

  async function applyPaycheck() {
    if (!selectedSource) {
      showToast('No active income source to apply.', 'error');
      return;
    }
    if (effectiveAmount <= 0) {
      showToast('Amount must be greater than zero.', 'error');
      return;
    }
    if (Math.abs(remaining) >= 0.01) {
      showToast(remaining > 0 ? `Allocate the remaining ${fmtMoney(remaining)} first.` : `Over-allocated by ${fmtMoney(Math.abs(remaining))}.`, 'error');
      return;
    }

    const accountAllocs: Allocation[] = Object.entries(splits)
      .map(([id, amt]) => ({ id: Number(id), amt: amt || 0 }))
      .filter(x => x.amt > 0)
      .map(x => {
        const a = accounts!.find(acc => acc.id === x.id)!;
        return { targetAccount: a.name, amount: x.amt };
      });
    const liabilityAllocs: Allocation[] = Object.entries(liabilitySplits)
      .map(([id, amt]) => ({ id: Number(id), amt: amt || 0 }))
      .filter(x => x.amt > 0)
      .map(x => {
        const l = liabilities!.find(lia => lia.id === x.id)!;
        return { targetLiability: l.name, liabilityId: l.id, amount: x.amt };
      });
    const allocations: Allocation[] = [...accountAllocs, ...liabilityAllocs];

    const event: Omit<PaycheckEvent, 'id'> = {
      date,
      source: selectedSource.name,
      netAmount: effectiveAmount,
      allocations,
      bankExpensesPaid: checkingReserve,
      notes,
    };

    try {
      await db.transaction('rw', [db.accounts, db.liabilities, db.paycheckEvents, db.netWorthSnapshots], async () => {
        // Credit each account by its split (checking included — it's just another account in the splits map).
        // Then subtract the bank-transfer reserve from checking to reflect the auto-pays leaving the account.
        for (const a of accounts!) {
          const delta = splits[a.id] ?? 0;
          if (delta === 0 && a.id !== primaryChecking?.id) continue;
          const isChecking = a.id === primaryChecking?.id;
          const newBalance = a.balance + delta - (isChecking ? checkingReserve : 0);
          await db.accounts.update(a.id, {
            balance: newBalance,
            lastUpdated: date,
          });
        }

        // Pay down any liability the user allocated to. Floor at 0 so we don't go negative.
        for (const l of liabilities!) {
          const pay = liabilitySplits[l.id] ?? 0;
          if (pay <= 0) continue;
          const newBalance = Math.max(0, l.balance - pay);
          await db.liabilities.update(l.id, { balance: newBalance });
        }

        await db.paycheckEvents.add(event as PaycheckEvent);

        const freshAccounts = await db.accounts.toArray();
        const freshLiabs = await db.liabilities.toArray();
        const liquid = freshAccounts.filter(a => ['checking', 'hysa', 'cash'].includes(a.type)).reduce((s, a) => s + a.balance, 0);
        const invested = freshAccounts.filter(a => ['roth_ira', 'brokerage'].includes(a.type)).reduce((s, a) => s + a.balance, 0);
        const totalAssetsSum = freshAccounts.reduce((s, a) => s + a.balance, 0);
        const debtSum = freshLiabs.filter(l => l.isActive).reduce((s, l) => s + l.balance, 0);
        const ccTotal = freshLiabs.filter(l => l.type === 'credit_card' && l.isActive).reduce((s, l) => s + l.balance, 0);
        await db.netWorthSnapshots.add({
          date,
          totalLiquid: liquid,
          totalInvested: invested,
          totalDebt: debtSum,
          totalCreditCard: ccTotal,
          netWorth: totalAssetsSum - debtSum,
          notes: `After paycheck: ${selectedSource.name}`,
        } as any);
      });
    } catch (err) {
      console.error('Apply paycheck failed:', err);
      showToast(`Apply failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
      return;
    }

    scheduleAutoSave(500);
    setAmount(0);
    setNotes('');
    clearAll();
    showToast('Paycheck applied. Balances updated.', 'success');
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Payday</h1>
      <div className="text-sm text-ink-300 mb-4">Log a paycheck and type in how much goes to each account.</div>

      <div className="card p-4 mb-6 text-xs text-ink-300 bg-ink-800/60 border-ink-700">
        <div className="font-medium text-ink-50 mb-1">How this works</div>
        <ol className="list-decimal ml-4 space-y-0.5">
          <li>Your <strong>net pay</strong> comes from the selected income source (edit its default in Manage → Income).</li>
          <li>The <strong>checking reserve</strong> is auto-calculated from active fixed expenses with payment method <em>Bank Transfer</em> (Manage → Expenses), converted to this paycheck's cadence.</li>
          <li>Type how much of the net pay goes into each account — or into a <strong>Liability Paydown</strong> row to reduce debt directly. The <em>Suggested</em> link uses your tier waterfall (Manage → Tiers) as a hint — it's never auto-applied.</li>
          <li>Apply unlocks when <strong>Remaining = $0</strong>. Each account's balance moves by the amount you typed; checking then immediately pays the bank-transfer expenses. Liability rows decrement the matching debt by the amount you typed.</li>
        </ol>
      </div>

      <Section title="Paycheck Details">
        <div className="card p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-ink-300 mb-1">Source</label>
            <select
              className="input"
              value={selectedSource?.id ?? ''}
              onChange={e => setSourceId(parseInt(e.target.value))}
            >
              {activeSources.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-300 mb-1">
              Net amount <span className="text-ink-400">(default ${selectedSource?.amount.toFixed(2)})</span>
            </label>
            <CurrencyInput value={amount} onChange={setAmount} />
          </div>
          <div>
            <label className="block text-xs text-ink-300 mb-1">Date</label>
            <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>
      </Section>

      {warnings.length > 0 && (
        <Section title="Warnings">
          <div className="card border-warn/30">
            {warnings.map((w, i) => (
              <div key={i} className="p-4 text-sm text-warn border-b border-ink-700 last:border-b-0">{w}</div>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Allocate Paycheck"
        action={
          <div className="flex gap-2">
            <button className="btn-ghost text-xs" onClick={applySuggestedToAll}>Use suggested</button>
            <button className="btn-ghost text-xs" onClick={clearAll}>Reset</button>
          </div>
        }
      >
        <div className="card p-5 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-xs text-ink-300">Net pay</div>
              <div className="text-xl font-semibold tabular"><Money amount={effectiveAmount} /></div>
            </div>
            <div>
              <div className="text-xs text-ink-300">Checking reserve</div>
              <div className="text-xl font-semibold tabular text-ink-200">-<Money amount={checkingReserve} /></div>
              <div className="text-[10px] text-ink-400 mt-0.5">auto-pays leave checking</div>
            </div>
            <div>
              <div className="text-xs text-ink-300">Allocated</div>
              <div className="text-xl font-semibold tabular text-accent"><Money amount={allocated} /></div>
            </div>
            <div>
              <div className="text-xs text-ink-300">Remaining</div>
              <div className={`text-xl font-semibold tabular ${Math.abs(remaining) < 0.01 ? 'text-accent' : remaining < 0 ? 'text-danger' : 'text-warn'}`}>
                <Money amount={remaining} showSign />
              </div>
            </div>
          </div>
          <div className="text-xs text-ink-300 mt-4 pt-4 border-t border-ink-700">
            <span className="font-medium">Bank transfers this period: </span>
            {expenses.filter(e => e.isActive && e.paymentMethod === 'Bank Transfer').map((e, i) => (
              <span key={e.id}>
                {i > 0 && ', '}
                {e.name} <Money amount={e.amount} />
              </span>
            ))}
            {checkingReserve === 0 && <span className="text-ink-400">None configured. Add a fixed expense with payment method "Bank Transfer" under Manage → Expenses to reserve money in checking each paycheck.</span>}
          </div>
        </div>

        <div className="card divide-y divide-ink-700">
          {openedAccounts.map(a => {
            const isChecking = a.id === primaryChecking?.id;
            const value = splits[a.id] ?? 0;
            const suggestedAmount = suggested.get(a.name) ?? 0;
            return (
              <div key={a.id} className="p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{a.name}</div>
                    <span className="text-[10px] uppercase tracking-wider text-ink-400 bg-ink-700 px-1.5 py-0.5 rounded">{a.type}</span>
                  </div>
                  <div className="text-xs text-ink-300 mt-1 flex items-center gap-3 flex-wrap">
                    <span>Current: <Money amount={a.balance} showCents={false} /></span>
                    {isChecking && <span className="text-warn">Needs ≥ <Money amount={checkingReserve} /> for bank transfers</span>}
                    {suggestedAmount > 0 && (
                      <button className="text-accent hover:underline" onClick={() => useSuggested(a.name, a.id)}>
                        Suggested: <Money amount={suggestedAmount} />
                      </button>
                    )}
                    {remaining > 0.005 && (
                      <button
                        className="text-accent hover:underline"
                        onClick={() => setSplit(a.id, Math.round((value + remaining) * 100) / 100)}
                      >
                        + Fill remainder (<Money amount={remaining} />)
                      </button>
                    )}
                  </div>
                </div>
                <div className="w-36">
                  <CurrencyInput value={value} onChange={v => setSplit(a.id, v)} />
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {activeLiabilities.length > 0 && (
        <Section title="Liability Paydown">
          <div className="text-xs text-ink-300 mb-3">
            Dollars allocated here reduce the liability balance directly (money leaves your paycheck pool, debt goes down by the same amount — net worth +). Does <strong>not</strong> flow through checking, and does <strong>not</strong> auto-link to any bank-transfer fixed expense of the same name.
          </div>
          <div className="card divide-y divide-ink-700">
            {activeLiabilities.map(l => {
              const value = liabilitySplits[l.id] ?? 0;
              const daysOut = l.dueDate ? Math.ceil((new Date(l.dueDate).getTime() - new Date(date).getTime()) / 86400000) : null;
              return (
                <div key={l.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{l.name}</div>
                      <span className="text-[10px] uppercase tracking-wider text-ink-400 bg-ink-700 px-1.5 py-0.5 rounded">{l.type.replace('_', ' ')}</span>
                    </div>
                    <div className="text-xs text-ink-300 mt-1 flex items-center gap-3 flex-wrap">
                      <span>Balance: <Money amount={l.balance} showCents={false} /></span>
                      {l.apr > 0 && <span className="text-ink-400">APR: {(l.apr * 100).toFixed(2)}%</span>}
                      {daysOut !== null && daysOut >= 0 && daysOut <= 30 && (
                        <span className="text-warn">Due in {daysOut} day{daysOut === 1 ? '' : 's'}</span>
                      )}
                      {value > 0 && value < l.balance && (
                        <span className="text-ink-400">After: <Money amount={l.balance - value} showCents={false} /></span>
                      )}
                      {value >= l.balance - 0.005 && value > 0 && (
                        <span className="text-accent">Pays off in full</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {remaining > 0.005 && (
                      <button
                        className="text-xs text-accent hover:underline"
                        onClick={() => {
                          const fill = Math.min(l.balance, value + remaining);
                          setLiabilitySplit(l.id, Math.round(fill * 100) / 100);
                        }}
                      >
                        + Fill
                      </button>
                    )}
                    <div className="w-36">
                      <CurrencyInput value={value} onChange={v => setLiabilitySplit(l.id, v)} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Confirm">
        <div className="card p-5">
          <label className="block text-xs text-ink-300 mb-1">Notes (optional)</label>
          <input className="input mb-4" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything to remember about this paycheck?" />
          <div className="flex items-center justify-between">
            <div className="text-xs text-ink-300">
              Applying will update account balances and log this paycheck.
              <br />You still need to physically move the money (HYSA transfer, Roth contribution, etc.) to match.
            </div>
            <button className="btn-primary" onClick={applyPaycheck} disabled={!canApply}>
              Apply paycheck ({fmtDate(date)})
            </button>
          </div>
        </div>
      </Section>

      {history.length > 0 && (
        <Section title={`Recent Paychecks (${history.length} total)`}>
          <div className="card divide-y divide-ink-700">
            {history.slice().reverse().slice(0, 5).map(p => {
              const acctCount = p.allocations.filter(a => a.targetAccount).length;
              const liabCount = p.allocations.filter(a => a.targetLiability).length;
              const parts = [
                acctCount > 0 ? `${acctCount} account${acctCount === 1 ? '' : 's'}` : null,
                liabCount > 0 ? `${liabCount} liabilit${liabCount === 1 ? 'y' : 'ies'}` : null,
              ].filter(Boolean);
              const isOpen = expandedHistory.has(p.id);
              const allocSum = p.allocations.reduce((s, a) => s + a.amount, 0);
              return (
                <div key={p.id}>
                  <button
                    className="w-full p-4 flex items-center justify-between hover:bg-ink-700/30 transition-colors text-left"
                    onClick={() => setExpandedHistory(prev => {
                      const next = new Set(prev);
                      if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                      return next;
                    })}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-ink-400 text-xs transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                      <div>
                        <div className="font-medium">{p.source}</div>
                        <div className="text-xs text-ink-300">{fmtDate(p.date)} · {parts.join(' · ') || 'no allocations'}</div>
                      </div>
                    </div>
                    <div className="text-right tabular">
                      <div><Money amount={p.netAmount} /></div>
                      <div className="text-xs text-ink-300">net</div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pl-10 text-xs">
                      <div className="bg-ink-900/40 rounded-lg border border-ink-700 divide-y divide-ink-700">
                        {p.allocations.length === 0 && (
                          <div className="p-3 text-ink-400 italic">No allocations recorded.</div>
                        )}
                        {p.allocations.map((a, idx) => (
                          <div key={idx} className="p-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {a.targetAccount ? (
                                <>
                                  <span className="text-[10px] uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded">to account</span>
                                  <span className="text-ink-50">{a.targetAccount}</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-[10px] uppercase tracking-wider text-warn bg-warn/10 px-1.5 py-0.5 rounded">paydown</span>
                                  <span className="text-ink-50">{a.targetLiability}</span>
                                </>
                              )}
                              {a.tierName && <span className="text-ink-400">via tier "{a.tierName}"</span>}
                            </div>
                            <div className="tabular text-ink-50">
                              <Money amount={a.amount} />
                            </div>
                          </div>
                        ))}
                        <div className="p-3 flex items-center justify-between text-ink-300">
                          <span>Bank-transfer reserve (left checking)</span>
                          <span className="tabular">-<Money amount={p.bankExpensesPaid} /></span>
                        </div>
                        <div className="p-3 flex items-center justify-between text-ink-400">
                          <span>Sum of allocations</span>
                          <span className="tabular"><Money amount={allocSum} /></span>
                        </div>
                        {p.notes && (
                          <div className="p-3 text-ink-300 italic">"{p.notes}"</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
