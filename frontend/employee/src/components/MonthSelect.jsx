import { CalendarDays, ChevronDown } from 'lucide-react';
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

export function MonthSelect({ value, months, onChange }) {
  return (
    <label className="month-select">
      <CalendarDays className="month-select__icon" aria-hidden="true" />
      <span className="visually-hidden">Month</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {months.map((month) => (
          <option key={month} value={month}>
            {formatMonth(month)}
          </option>
        ))}
      </select>
      <ChevronDown className="month-select__chevron" aria-hidden="true" />
    </label>
  );
}
