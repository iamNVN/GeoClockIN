import { MapPin, MapPinOff, PenLine } from 'lucide-react';
import { formatDistance, formatDuration, formatTime } from '../lib/format.js';
import { Avatar, StatusPill } from './ui.jsx';

export const ATTENDANCE_COLUMNS = ['Employee', 'Department', 'Check In', 'Check Out', 'Work Hours', 'Status', 'Location'];

/** Where the check-in was recorded from. */
function LocationCell({ record }) {
  if (!record) return <span className="muted">--:--</span>;
  if (record.source !== 'app') {
    return (
      <span className="location-cell location-cell--manual" title={record.note ?? undefined}>
        <PenLine aria-hidden="true" /> {record.source === 'import' ? 'Imported' : 'Added by admin'}
      </span>
    );
  }
  const distance = formatDistance(record.checkInDistanceM);
  return distance ? (
    <span className="location-cell">
      <MapPin aria-hidden="true" /> Inside Office · {distance}
    </span>
  ) : (
    <span className="location-cell location-cell--manual">
      <MapPinOff aria-hidden="true" /> Unknown
    </span>
  );
}

export function EmployeeCell({ employee }) {
  return (
    <span className="table__employee">
      <Avatar name={employee.name} />
      <span>
        <strong>{employee.name}</strong>
        <span>{employee.id}</span>
      </span>
    </span>
  );
}

/** One employee's day. `actions` renders the last cell when given. */
export function AttendanceRow({ row, index, actions }) {
  const { employee, record, status, isLate } = row;
  return (
    <tr className="reveal-row" style={{ '--i': index }}>
      <td className="table__index">{index}</td>
      <td className="td--primary">
        <EmployeeCell employee={employee} />
      </td>
      <td data-label="Department">{employee.department || '—'}</td>
      <td className="tabular" data-label="Check In">
        {formatTime(record?.checkInAt)}
        {isLate && status !== 'late' && <span className="tag tag--late">Late</span>}
      </td>
      <td className="tabular" data-label="Check Out">
        {formatTime(record?.checkOutAt)}
      </td>
      <td className="tabular" data-label="Work Hours">
        {formatDuration(record?.workedMinutes)}
      </td>
      <td data-label="Status">
        <StatusPill status={status} />
      </td>
      <td data-label="Location">
        <LocationCell record={record} />
      </td>
      {actions && <td className="table__actions">{actions}</td>}
    </tr>
  );
}
