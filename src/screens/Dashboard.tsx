import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { db } from '../db';
import { StatCard, Money, Progress, Section } from '../components/UI';
import { netWorth, totalLiquid, totalInvested, totalOther, totalDebt, monthlyExpenseTotal, savingsRateYTD, ccRunway, ytdSavings } from '../core/calc';
import { allocate } from '../core/allocator';
import { fmt, fmtDate, daysUntil, convertCadence } from '../core/dates';

export default function Dashboard() {
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const liabilities = useLiveQuery(() => db.liabilities.toArray(), []);
  const incomeSources = useLiveQuery(() => db.incomeSources.toArray(), []);
  const expenses = useLiveQuery(() => db.fixedExpenses.toArray(), []);
  const tiers = useLiveQuery(() => db.tiers.toArray(), []);
  const history = useLiveQuery(() => db.paycheckEvents.toArray(), []);
  const snapshots = useLiveQuery(() => db.netWorthSnapshots.orderBy('date').toArray(), []);
  const settings = useLiveQuery(() => db.settings.get(1), []);

  if (!accounts || !liabilities || !incomeSources || !expenses || !tiers || !history || !snapshots || !settings) {
    return <div className="text-ink-300">Loading…</div>;
  }

  const liquid = totalLiquid(accounts);
  const invested = totalInvested(accounts);
  const other = totalOther(accounts);
  const debt = totalDebt(liabilities);
  const nw = netWorth(accounts, liabilities);

  const primaryIncome = incomeSources.find(i => i.sourceType === 'paycheck' && i.isActive);
  const primaryChecking = accounts.find(a => a.type === 'checking');
  const cc = liabilities.find(l => l.isActive && l.type === 'credit_card');

  // Preview of next paycheck allocation
  const nextPlan = primaryIncome ? allocate({
    netPay: primaryIncome.amount,
    payCadence: primaryIncome.cadence,
    accounts, liabilities, tiers, fixedExpenses: expenses,
    paycheckHistory: history,
    settings,
  }) : null;

  // CC runway
  const runway = (cc && primaryIncome && primaryChecking) ? ccRunway(
    cc.balance,
    cc.dueDate,
    primaryChecking.balance,
    primaryIncome.amount,
    primaryIncome.cadence,
    expenses.filter(e => e.isActive && e.paymentMethod === 'Bank Transfer')
      .reduce((s, e) => s + convertCadence(e.amount, e.cadence, primaryIncome.cadence), 0),
  ) : null;

  const savingsRate = savingsRateYTD(history, accounts);
  const ytdSaved = ytdSavings(history, accounts);
  const monthlyExp = monthlyExpenseTotal(expenses);

  const activeTiers = [...tiers].filter(t => t.isActive).sort((a, b) => a.priority - b.priority);
  const chartData = snapshots.map(s => ({
    date: s.date.slice(5, 10),
    net: s.netWorth,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Dashboard</h1>
      <div className="text-sm text-ink-300 mb-6">As of {fmtDate(new Date())}</div>

      <div className={`grid grid-cols-2 ${other > 0 ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4 mb-8`}>
        <StatCard label="Net Worth" value={nw} tone={nw >= 0 ? 'accent' : 'danger'} subtext="All accounts − active debt" />
        <StatCard label="Liquid" value={liquid} subtext="Checking + HYSA + cash" />
        <StatCard label="Invested" value={invested} subtext="Roth + brokerage" />
        {other > 0 && <StatCard label="Other" value={other} subtext="Other-typed accounts" />}
        <StatCard label="Debt" value={debt} tone={debt > 0 ? 'warn' : 'default'} subtext="All active liabilities" />
      </div>

      {/* CC Runway — only meaningful while CC balance > 0 */}
      {cc && runway && cc.balance > 0 && (
        <Section title="Credit Card Runway">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm text-ink-300">{cc.name} — due in <span className="text-ink-50 font-medium">{runway.daysUntilDue} days</span> ({fmtDate(cc.dueDate!)})</div>
                <div className="text-xl font-semibold mt-1">
                  <Money amount={cc.balance} /> outstanding
                </div>
              </div>
              <div className={`text-sm px-3 py-1.5 rounded-full ${runway.onTrack ? 'bg-accent/15 text-accent' : 'bg-danger/15 text-danger'}`}>
                {runway.onTrack ? 'On track' : `Short by ${fmt(runway.shortfall)}`}
              </div>
            </div>
            <div className="text-xs text-ink-300">
              With {runway.paychecksUntilDue} paycheck{runway.paychecksUntilDue === 1 ? '' : 's'} before the due date, your projected checking balance will be ~<Money amount={(primaryChecking?.balance ?? 0) + runway.paychecksUntilDue * ((primaryIncome?.amount ?? 0) - expenses.filter(e => e.isActive && e.paymentMethod === 'Bank Transfer').reduce((s, e) => s + convertCadence(e.amount, e.cadence, primaryIncome!.cadence), 0))} />.
            </div>
          </div>
        </Section>
      )}

      {/* Savings rate */}
      <Section title="Savings Progress YTD">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-5">
            <div className="text-xs uppercase tracking-wider text-ink-300">Savings rate YTD</div>
            <div className="text-2xl font-semibold mt-2 tabular">{(savingsRate * 100).toFixed(1)}%</div>
            <div className="mt-3"><Progress value={savingsRate} max={settings.targetSavingsRate} tone={savingsRate >= settings.targetSavingsRate ? 'accent' : 'warn'} /></div>
            <div className="text-xs text-ink-300 mt-2">Target: {(settings.targetSavingsRate * 100).toFixed(0)}%</div>
          </div>
          <div className="card p-5">
            <div className="text-xs uppercase tracking-wider text-ink-300">Saved YTD</div>
            <div className="text-2xl font-semibold mt-2 tabular"><Money amount={ytdSaved} /></div>
            <div className="text-xs text-ink-300 mt-2">Allocated to tiers 1–4 this year</div>
          </div>
          <div className="card p-5">
            <div className="text-xs uppercase tracking-wider text-ink-300">Monthly expenses</div>
            <div className="text-2xl font-semibold mt-2 tabular"><Money amount={monthlyExp} /></div>
            <div className="text-xs text-ink-300 mt-2">Active recurring outflows</div>
          </div>
        </div>
      </Section>

      {/* Tier progress */}
      <Section
        title="Allocation Tiers"
        action={<Link to="/payday" className="btn-primary">Log a paycheck</Link>}
      >
        <div className="text-xs text-ink-300 mb-3">
          Suggested pacing — not auto-applied. Enter your actual split on Payday.
        </div>
        <div className="card divide-y divide-ink-700">
          {activeTiers.map(tier => {
            const plan = nextPlan?.tiers.find(p => p.tierId === tier.id);
            const progress = plan?.currentProgress ?? 0;
            const cap = plan?.cap ?? tier.cap;
            const isUnlimited = tier.capType === 'unlimited';
            return (
              <div key={tier.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-ink-700 grid place-items-center text-xs font-semibold">{tier.priority}</div>
                    <div>
                      <div className="font-medium">{tier.name}</div>
                      <div className="text-xs text-ink-300">→ {tier.targetAccount}</div>
                    </div>
                  </div>
                  <div className="text-right tabular text-sm">
                    {isUnlimited ? (
                      <span className="text-ink-300">no cap</span>
                    ) : (
                      <><Money amount={progress} showCents={false} /> / <Money amount={cap} showCents={false} /></>
                    )}
                  </div>
                </div>
                {!isUnlimited && (
                  <Progress
                    value={progress}
                    max={cap}
                    tone={progress >= cap ? 'accent' : 'neutral'}
                  />
                )}
                {plan && plan.thisAllocation > 0 && (
                  <div className="mt-2 text-xs text-accent">
                    Next paycheck will add <Money amount={plan.thisAllocation} /> → projected <Money amount={plan.projectedProgressAfter} showCents={false} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Net worth history */}
      {chartData.length > 1 && (
        <Section title="Net Worth Over Time">
          <div className="card p-5">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#232c3d" />
                <XAxis dataKey="date" stroke="#a0aec0" fontSize={11} />
                <YAxis stroke="#a0aec0" fontSize={11} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: '#1a2230', border: '1px solid #2c3750', borderRadius: 8 }} />
                <Line type="monotone" dataKey="net" stroke="#4ade80" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      {/* Pending-action flags */}
      {(() => {
        const flags: { level: 'warn' | 'info'; msg: string }[] = [];
        const unopenedWithTiers = accounts.filter(a => a.openedYet === false
          && tiers.some(t => t.isActive && t.targetAccount === a.name));
        for (const a of unopenedWithTiers) {
          const tier = tiers.find(t => t.targetAccount === a.name);
          const priorCascadeFilled = tier && tiers.filter(t => t.isActive && t.priority < tier.priority)
            .every(t => {
              const plan = nextPlan?.tiers.find(p => p.tierId === t.id);
              return plan?.isFilled || t.capType === 'unlimited';
            });
          flags.push({
            level: priorCascadeFilled ? 'warn' : 'info',
            msg: `${a.name} is not opened yet. ${priorCascadeFilled ? 'Tiers before it are filled — open it soon so Tier ${tier?.priority} can flow.' : 'Open before Tier ' + tier?.priority + ' activates.'}`,
          });
        }
        if (flags.length === 0) return null;
        return (
          <Section title="Pending Actions">
            <div className="card divide-y divide-ink-700">
              {flags.map((f, i) => (
                <div key={i} className={`p-4 text-sm ${f.level === 'warn' ? 'text-warn' : 'text-ink-200'}`}>
                  {f.msg}
                </div>
              ))}
            </div>
          </Section>
        );
      })()}
    </div>
  );
}
