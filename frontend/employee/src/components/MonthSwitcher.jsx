import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { serverNow } from '../lib/clock.js';
import { formatMonth, monthOf, monthsBetween } from '../lib/format.js';

/** Selected month, kept in the `?month=` query string so it survives navigation. */
export function useSelectedMonth() {
  const { employee } = useAuth();
  const [params, setParams] = useSearchParams();
  const months = monthsBetween(employee.attendanceSince.slice(0, 7), monthOf(serverNow()));
  const requested = params.get('month');
  const month = months.includes(requested) ? requested : months[0];
  const setMonth = (value) => setParams(value === months[0] ? {} : { month: value }, { replace: true });
  return { month, months, setMonth };
}

/** ‹ October 2026 › — arrows step through months; tapping the label opens a picker. */
export function MonthSwitcher({ value, months, onChange }) {
  const index = months.indexOf(value); // newest first
  const older = months[index + 1];
  const newer = months[index - 1];

  return (
    <div className="month-switcher">
      <button
        type="button"
        className="icon-button"
        onClick={() => onChange(older)}
        disabled={!older}
        aria-label="Previous month"
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      <label className="month-switcher__label">
        <CalendarDays className="month-switcher__icon" aria-hidden="true" />
        <span key={value} className="month-switcher__text">
          {formatMonth(value)}
        </span>
        <ChevronDown className="month-switcher__caret" aria-hidden="true" />
        <select value={value} onChange={(event) => onChange(event.target.value)} aria-label="Choose month">
          {months.map((month) => (
            <option key={month} value={month}>
              {formatMonth(month)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="icon-button"
        onClick={() => onChange(newer)}
        disabled={!newer}
        aria-label="Next month"
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  );
}
