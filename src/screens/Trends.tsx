import { useLiveQuery } from 'dexie-react-hooks';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { db } from '../db';
import { Section, Money } from '../components/UI';

export default function Trends() {
  const snapshots = useLiveQuery(() => db.netWorthSnapshots.orderBy('date').toArray(), []);

  if (!snapshots) return <div className="text-ink-300">Loading…</div>;

  const chartData = snapshots.map(s => ({
    date: s.date.slice(5, 10),
    credit: s.totalCreditCard ?? null,
    debt: s.totalDebt,
    liquid: s.totalLiquid,
    net: s.netWorth,
  }));

  const latest = snapshots[snapshots.length - 1];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Trends</h1>
      <div className="text-sm text-ink-300 mb-6">
        Snapshots are captured each payday. Credit series begins once you record a payday after this update.
      </div>

      {chartData.length < 2 ? (
        <div className="card p-6 text-sm text-ink-300">
          Not enough history yet. Run a few paychecks on the Payday screen to build a trend.
        </div>
      ) : (
        <>
          <Section title="Balances Over Time">
            <div className="card p-5">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#232c3d" />
                  <XAxis dataKey="date" stroke="#a0aec0" fontSize={11} />
                  <YAxis stroke="#a0aec0" fontSize={11} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: '#1a2230', border: '1px solid #2c3750', borderRadius: 8 }}
                    formatter={(v) => typeof v === 'number' ? `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Line type="monotone" dataKey="net" name="Net Worth" stroke="#4ade80" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="liquid" name="Liquid" stroke="#60a5fa" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="debt" name="Debt" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="credit" name="Credit Cards" stroke="#ef4444" strokeWidth={2} dot={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Section>

          {latest && (
            <Section title={`Latest Snapshot — ${latest.date.slice(0, 10)}`}>
              <div className="card p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <LatestStat label="Net Worth" amount={latest.netWorth} tone="accent" />
                <LatestStat label="Liquid" amount={latest.totalLiquid} tone="info" />
                <LatestStat label="Debt" amount={latest.totalDebt} tone="warn" />
                <LatestStat label="Credit Cards" amount={latest.totalCreditCard} tone="danger" />
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function LatestStat({ label, amount, tone }: { label: string; amount: number | undefined; tone: 'accent' | 'info' | 'warn' | 'danger' }) {
  const colorClass =
    tone === 'accent' ? 'text-accent' :
    tone === 'info' ? 'text-[#60a5fa]' :
    tone === 'warn' ? 'text-warn' :
    'text-danger';

  return (
    <div>
      <div className="text-xs text-ink-300 mb-1">{label}</div>
      <div className={`text-xl font-semibold tabular ${colorClass}`}>
        {amount == null ? <span className="text-ink-400">—</span> : <Money amount={amount} showCents={false} />}
      </div>
    </div>
  );
}
