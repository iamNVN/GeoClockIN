import { MapPin, MapPinOff, PenLine, QrCode } from 'lucide-react';
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
      {record.checkInQr && (
        <span className="tag tag--qr" title={`Office QR scanned at ${record.checkInQr}`}>
          <QrCode aria-hidden="true" /> QR
        </span>
      )}
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

/**
 * Phone layout of a day row, shown instead of the columns (see `.table--compact`):
 * name and "ID (Department)" beside the status, then check-in and check-out.
 */
export function MobileDayCell({ row, actions }) {
  const { employee, record, status, isLate } = row;
  return (
    <td className="td-mobile">
      <div className="m-row">
        <strong className="m-row__name">{employee.name}</strong>
        <span className="m-row__meta">
          {employee.id}
          {employee.department && ` (${employee.department})`}
        </span>
        <span className="m-row__status">
          <StatusPill status={status} />
          {actions}
        </span>
        <div className="m-row__times">
          <span>
            <small>Check in</small>
            <strong>
              {formatTime(record?.checkInAt)}
              {isLate && status !== 'late' && <span className="tag tag--late">Late</span>}
            </strong>
          </span>
          <span>
            <small>Check out</small>
            <strong>{formatTime(record?.checkOutAt)}</strong>
          </span>
        </div>
      </div>
    </td>
  );
}

/** One employee's day. `actions` renders the last cell when given. */
export function AttendanceRow({ row, index, actions }) {
  const { employee, record, status, isLate } = row;
  return (
    <tr className="reveal-row" style={{ '--i': index }}>
      <MobileDayCell row={row} actions={actions} />
      <td className="table__index">{index}</td>
      <td>
        <EmployeeCell employee={employee} />
      </td>
      <td>{employee.department || '—'}</td>
      <td className="tabular">
        {formatTime(record?.checkInAt)}
        {isLate && status !== 'late' && <span className="tag tag--late">Late</span>}
      </td>
      <td className="tabular">{formatTime(record?.checkOutAt)}</td>
      <td className="tabular">{formatDuration(record?.workedMinutes)}</td>
      <td>
        <StatusPill status={status} />
      </td>
      <td>
        <LocationCell record={record} />
      </td>
      {actions && <td className="table__actions">{actions}</td>}
    </tr>
  );
}
