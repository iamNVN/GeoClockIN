import { Clock, LogOut, UserRound, Users } from 'lucide-react';
import { percent } from '../lib/format.js';
import { KpiCard } from './ui.jsx';

/** The four headline KPIs for a day (Dashboard and Attendance). */
export function DayKpis({ kpis, loading }) {
  const expected = kpis?.expected ?? 0;
  const absent = (kpis?.absent ?? 0) + (kpis?.pending ?? 0);
  const ring = (value) => (kpis ? percent(value, expected) : undefined);
  return (
    <div className="kpis">
      <KpiCard index={0} tone="green" Icon={Users} value={kpis?.attended} label="Present" percent={ring(kpis?.attended)} loading={loading} />
      <KpiCard index={1} tone="red" Icon={UserRound} value={absent} label="Absent" percent={ring(absent)} loading={loading} />
      <KpiCard index={2} tone="amber" Icon={Clock} value={kpis?.late} label="Late" percent={ring(kpis?.late)} loading={loading} />
      <KpiCard
        index={3}
        tone="blue"
        Icon={LogOut}
        value={kpis?.notCheckedOut}
        label="Not Checked Out"
        percent={ring(kpis?.notCheckedOut)}
        loading={loading}
      />
    </div>
  );
}
