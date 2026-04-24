import { fmt } from '../core/dates';

export function StatCard({
  label, value, subtext, tone = 'default',
}: {
  label: string;
  value: string | number;
  subtext?: string;
  tone?: 'default' | 'accent' | 'warn' | 'danger';
}) {
  const toneClass = tone === 'accent' ? 'text-accent'
    : tone === 'warn' ? 'text-warn'
    : tone === 'danger' ? 'text-danger'
    : 'text-ink-50';

  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wider text-ink-300">{label}</div>
      <div className={`text-2xl font-semibold mt-2 tabular ${toneClass}`}>
        {typeof value === 'number' ? fmt(value, { showCents: false }) : value}
      </div>
      {subtext && <div className="text-xs text-ink-300 mt-1">{subtext}</div>}
    </div>
  );
}

export function Money({ amount, className = '', showCents = true, showSign = false }: {
  amount: number; className?: string; showCents?: boolean; showSign?: boolean;
}) {
  return <span className={`tabular ${className}`}>{fmt(amount, { showCents, showSign })}</span>;
}

export function Progress({ value, max, tone = 'accent' }: {
  value: number; max: number; tone?: 'accent' | 'warn' | 'danger' | 'neutral';
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const barColor = tone === 'accent' ? 'bg-accent'
    : tone === 'warn' ? 'bg-warn'
    : tone === 'danger' ? 'bg-danger'
    : 'bg-ink-400';
  return (
    <div className="w-full h-2 bg-ink-700 rounded-full overflow-hidden">
      <div className={`h-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function CurrencyInput({
  value, onChange, placeholder = '0.00', className = '',
}: {
  value: number; onChange: (v: number) => void; placeholder?: string; className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300">$</span>
      <input
        type="number"
        step="0.01"
        className="input pl-7 tabular"
        value={isNaN(value) || value === 0 ? '' : value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        placeholder={placeholder}
      />
    </div>
  );
}
