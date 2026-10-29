import { CalendarX } from 'lucide-react';
import { useState } from 'react';
import { DayDetails, DayRow } from '../components/DayRow.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { MonthSwitcher, useSelectedMonth } from '../components/MonthSwitcher.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Segmented } from '../components/Segmented.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { DayRowsSkeleton, Skeleton } from '../components/Skeleton.jsx';
import { useApi } from '../hooks/useApi.js';
import { addDays, formatDateRange, formatMonth, startOfWeek } from '../lib/format.js';
import { stagger } from '../lib/motion.js';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
];

/** Splits newest-first days into Monday-based weeks. */
function groupByWeek(days, today) {
  const thisWeek = startOfWeek(today);
  const lastWeek = addDays(thisWeek, -7);
  const groups = [];
  for (const day of days) {
    const week = startOfWeek(day.date);
    let group = groups.at(-1);
    if (group?.week !== week) {
      const label =
        week === thisWeek ? 'This week' : week === lastWeek ? 'Last week' : formatDateRange(week, addDays(week, 6));
      group = { week, label, days: [] };
      groups.push(group);
    }
    group.days.push(day);
  }
  return groups;
}

export default function HistoryPage() {
  const { month, months, setMonth } = useSelectedMonth();
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const history = useApi(`/attendance/history?month=${month}`);

  const loaded = history.data?.month === month ? history.data : null;
  const counts = loaded && {
    all: loaded.days.length,
    present: loaded.summary.present,
    late: loaded.summary.late,
    absent: loaded.summary.absent,
  };
  const days = loaded ? loaded.days.filter((d) => filter === 'all' || d.status === filter) : [];
  const groups = loaded ? groupByWeek(days, loaded.today) : [];

  let rowIndex = 0;

  return (
    <main className="page">
      <PageHeader title="Attendance History" />

      <MonthSwitcher value={month} months={months} onChange={setMonth} />

      <Segmented
        label="Filter by status"
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((f) => ({ ...f, count: counts?.[f.value] }))}
      />

      {history.error && !loaded ? (
        <section className="card">
          <ErrorState error={history.error} onRetry={history.reload} />
        </section>
      ) : !loaded ? (
        <div className="day-groups" aria-label="Loading attendance">
          {[3, 2].map((rows, i) => (
            <section key={i} className="day-group">
              <Skeleton width={90} height={13} style={{ margin: '0 4px 10px' }} />
              <div className="card day-list">
                <DayRowsSkeleton rows={rows} />
              </div>
            </section>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="empty-state pop-in">
          <span className="empty-state__icon">
            <CalendarX aria-hidden="true" />
          </span>
          <p className="empty-state__title">Nothing here yet</p>
          <p>
            {filter === 'all'
              ? `No attendance recorded for ${formatMonth(month)}.`
              : `No ${filter} days in ${formatMonth(month)}.`}
          </p>
        </div>
      ) : (
        <div key={`${month}-${filter}`} className="day-groups">
          {groups.map((group) => (
            <section key={group.week} className="day-group">
              <h2 className="day-group__label reveal" style={stagger(rowIndex)}>
                {group.label}
                <span>
                  {group.days.length} {group.days.length === 1 ? 'day' : 'days'}
                </span>
              </h2>
              <div className="card day-list">
                {group.days.map((day) => (
                  <DayRow key={day.date} day={day} style={stagger(++rowIndex)} onOpen={() => setSelected(day)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Sheet open={Boolean(selected)} title="Attendance Details" onClose={() => setSelected(null)}>
        {selected && <DayDetails day={selected} />}
      </Sheet>
    </main>
  );
}
