// Small shared building blocks.
import { CalendarHeart, ChevronDown, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { initials } from '../lib/format.js';

export function Avatar({ name, size = 'md' }) {
  return (
    <span className={`avatar avatar--${size}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

const STATUS = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  not_checked_out: 'Not Checked Out',
  pending: 'Not Checked In',
  off: 'Day Off',
  holiday: 'Holiday',
  active: 'Active',
  inactive: 'Inactive',
};

/** Banner shown on a holiday: nobody is expected in, so nobody is marked absent. */
export function HolidayNotice({ name }) {
  if (!name) return null;
  return (
    <p className="notice notice--holiday pop-in">
      <CalendarHeart aria-hidden="true" />
      <span>
        <strong>{name}</strong> is a holiday. Attendance isn’t expected and nobody is marked absent.
      </span>
    </p>
  );
}

export function StatusPill({ status, children }) {
  return <span className={`pill pill--${status}`}>{children ?? STATUS[status] ?? status}</span>;
}

/** Circular percentage that sweeps in from zero. */
export function Ring({ value, tone = 'green', size = 64, stroke = 6 }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setShown(Math.max(0, Math.min(100, value ?? 0))), 60);
    return () => clearTimeout(id);
  }, [value]);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className={`ring ring--${tone}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="ring__value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="ring__label">{value == null ? '—' : `${value}%`}</span>
    </span>
  );
}

/**
 * KPI card. tone: green | red | amber | blue.
 * With `percent`, shows a ring; otherwise a plain figure.
 */
export function KpiCard({ tone, Icon, value, label, percent, index = 0, loading = false }) {
  return (
    <section className={`kpi kpi--${tone} reveal`} style={{ '--i': index }}>
      <span className="kpi__icon">
        <Icon aria-hidden="true" />
      </span>
      <div className="kpi__text">
        {loading ? <Skeleton width={56} height={28} /> : <p className="kpi__value">{value}</p>}
        <p className="kpi__label">{label}</p>
      </div>
      {percent !== undefined && !loading && <Ring value={percent} tone={tone} size={52} stroke={5} />}
    </section>
  );
}

export function Skeleton({ width = '100%', height = 14, radius, className = '', style }) {
  return <span className={`skeleton ${className}`} style={{ width, height, borderRadius: radius, ...style }} aria-hidden="true" />;
}

export function PageHead({ title, subtitle, children }) {
  return (
    <header className="page-head">
      <div>
        <h1 className="page-head__title">{title}</h1>
        {subtitle && <p className="page-head__subtitle">{subtitle}</p>}
      </div>
      {children && <div className="page-head__actions">{children}</div>}
    </header>
  );
}

/** Labelled native select with an optional leading icon. */
export function SelectField({ label, value, onChange, options, Icon, id, className = '' }) {
  return (
    <label className={`field ${className}`} htmlFor={id}>
      {label && <span className="field__label">{label}</span>}
      <span className={`select${Icon ? ' select--icon' : ''}`}>
        {Icon && <Icon className="select__icon" aria-hidden="true" />}
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="select__chevron" aria-hidden="true" />
      </span>
    </label>
  );
}

export function SearchField({ value, onChange, placeholder, label = 'Search', className = '' }) {
  return (
    <label className={`search ${className}`}>
      <Search aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

export function EmptyState({ Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && (
        <span className="empty__icon">
          <Icon aria-hidden="true" />
        </span>
      )}
      <p className="empty__title">{title}</p>
      {children && <div className="empty__text">{children}</div>}
    </div>
  );
}

/** Rows of placeholder cells for a loading table. */
export function TableSkeleton({ columns, rows = 6 }) {
  return Array.from({ length: rows }, (_, r) => (
    <tr key={r} aria-hidden="true">
      {Array.from({ length: columns }, (_, c) => (
        <td key={c}>
          <Skeleton width={c === 1 ? '70%' : '55%'} height={13} />
        </td>
      ))}
    </tr>
  ));
}
