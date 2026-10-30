import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatShortDate } from '../lib/format.js';

export const SERIES = [
  { key: 'present', label: 'Present', color: '#0f9d69' },
  { key: 'absent', label: 'Absent', color: '#f47a7a' },
  { key: 'late', label: 'Late', color: '#f6c445' },
];

export function Legend() {
  return (
    <ul className="chart-legend">
      {SERIES.map((s) => (
        <li key={s.key}>
          <span className="legend-dot" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__title">{formatShortDate(label)}</p>
      {payload.map((p) => (
        <p key={p.dataKey}>
          <span className="legend-dot" style={{ background: p.color }} /> {SERIES.find((s) => s.key === p.dataKey)?.label}:{' '}
          <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
}

const axis = { fontSize: 12, fill: '#64748b' };

/** Grouped bars per day: present, absent, late. */
export function TrendChart({ data, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barGap={4} barCategoryGap="22%" margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e8edf1" />
        <XAxis dataKey="date" tickFormatter={formatShortDate} tick={axis} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(15,157,105,0.06)' }} />
        {SERIES.map((s) => (
          <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={18} animationDuration={700} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Area chart across a date range. */
export function OverviewChart({ data, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          {SERIES.map((s) => (
            <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={s.key === 'present' ? 0.28 : 0.18} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e8edf1" />
        <XAxis dataKey="date" tickFormatter={formatShortDate} tick={axis} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip />} />
        {SERIES.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={s.color}
            strokeWidth={2}
            fill={`url(#fill-${s.key})`}
            animationDuration={800}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Department rows with a bar. `stacked` shows present / late / absent
 * segments; otherwise a single attendance bar.
 */
export function DepartmentBars({ departments, stacked = false }) {
  if (!departments.length) return <p className="muted">No departments to show for this period.</p>;
  return (
    <ul className="dept-list">
      {departments.map((d, i) => {
        const total = d.expected || 1;
        return (
          <li key={d.department} className="dept-row" style={{ '--i': i }}>
            <span className="dept-row__name">{d.department}</span>
            <span className="dept-row__bar" aria-hidden="true">
              {stacked ? (
                <>
                  <span className="dept-row__fill" style={{ width: `${((d.onTime ?? d.attended - d.late) / total) * 100}%` }} />
                  <span className="dept-row__fill dept-row__fill--late" style={{ width: `${(d.late / total) * 100}%` }} />
                  <span className="dept-row__fill dept-row__fill--absent" style={{ width: `${(d.absent / total) * 100}%` }} />
                </>
              ) : (
                <span className="dept-row__fill" style={{ width: `${(d.attended / total) * 100}%` }} />
              )}
            </span>
            <span className="dept-row__count">
              {d.attended}/{d.expected}
            </span>
            <span className="dept-row__pct">{d.rate == null ? '—' : `${d.rate}%`}</span>
          </li>
        );
      })}
    </ul>
  );
}
