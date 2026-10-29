const LABELS = { present: 'Present', late: 'Late', absent: 'Absent' };

export function StatusBadge({ status }) {
  return <span className={`badge badge--${status}`}>{LABELS[status] ?? status}</span>;
}
