import { Clock, LogOut, UserRound, Users } from 'lucide-react';
import { percent } from '../lib/format.js';
import { KpiCard } from './ui.jsx';

/** The four headline KPIs for a day (shared with the Attendance page). */
export function DayKpis({ kpis, loading, detailed = true }) {
  const expected = kpis?.expected ?? 0;
  const of = `of ${expected} employee${expected === 1 ? '' : 's'}`;
  const absent = (kpis?.absent ?? 0) + (kpis?.pending ?? 0);
  return (
    <div className="kpis">
      <KpiCard
        index={0}
        tone="green"
        Icon={Users}
        value={kpis?.attended}
        label={detailed ? 'Present Today' : 'Present'}
        sub={of}
        percent={kpis ? percent(kpis.attended, expected) : undefined}
        loading={loading}
      />
      <KpiCard
        index={1}
        tone="red"
        Icon={UserRound}
        value={absent}
        label={detailed ? 'Absent Today' : 'Absent'}
        sub={kpis?.pending ? `${kpis.pending} not checked in yet` : of}
        percent={kpis ? percent(absent, expected) : undefined}
        loading={loading}
      />
      <KpiCard
        index={2}
        tone="amber"
        Icon={Clock}
        value={kpis?.late}
        label={detailed ? 'Late Today' : 'Late'}
        sub={of}
        percent={kpis ? percent(kpis.late, expected) : undefined}
        loading={loading}
      />
      <KpiCard
        index={3}
        tone="blue"
        Icon={LogOut}
        value={kpis?.notCheckedOut}
        label="Not Checked Out"
        sub={of}
        percent={kpis ? percent(kpis.notCheckedOut, expected) : undefined}
        loading={loading}
      />
    </div>
  );
}
