import {
  Bell,
  Building2,
  CalendarDays,
  ChartNoAxesColumn,
  ChevronDown,
  Clock,
  LayoutGrid,
  LogOut,
  MapPin,
  Menu as MenuIcon,
  Search,
  Settings,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { qs } from '../lib/api.js';
import { formatLongDate, formatTime } from '../lib/format.js';
import { Menu } from './Menu.jsx';
import { useToast } from './Toast.jsx';
import { Avatar } from './ui.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', Icon: LayoutGrid, end: true },
  { to: '/attendance', label: 'Attendance', Icon: Clock },
  { to: '/employees', label: 'Employees', Icon: Users },
  { to: '/reports', label: 'Reports', Icon: ChartNoAxesColumn },
  { to: '/settings', label: 'Settings', Icon: Settings },
];

const LOGO = `${import.meta.env.BASE_URL}logo.webp`;

function Sidebar({ open, onClose }) {
  const { organization } = useAuth();
  return (
    <>
      <aside className={`sidebar${open ? ' is-open' : ''}`} aria-label="Main navigation">
        <div className="sidebar__brand">
          <img src={LOGO} alt="GeoClockIN" width="150" height="118" />
          <button type="button" className="icon-btn sidebar__close" onClick={onClose} aria-label="Close menu">
            <X aria-hidden="true" />
          </button>
        </div>
        <nav className="sidebar__nav">
          {NAV.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="nav-link" onClick={onClose}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        {organization && (
          <div className="sidebar__org">
            <span className="sidebar__org-icon">
              <Building2 aria-hidden="true" />
            </span>
            <div className="sidebar__org-text">
              <p className="sidebar__org-name">{organization.companyName}</p>
              <p className="sidebar__org-office">
                <MapPin aria-hidden="true" />
                {organization.officeName}
              </p>
            </div>
          </div>
        )}
      </aside>
      {open && <button type="button" className="sidebar-scrim" onClick={onClose} aria-label="Close menu" />}
    </>
  );
}

/** Today's late arrivals and missing check-outs. */
function Notifications() {
  const { today } = useAuth();
  const { data } = useApi(`/admin/attendance${qs({ date: today })}`);
  const late = data?.rows.filter((r) => r.isLate) ?? [];
  const missing = data?.rows.filter((r) => r.status === 'not_checked_out') ?? [];
  const items = [
    ...late.map((r) => ({ key: `late-${r.employee.id}`, text: `${r.employee.name} checked in late at ${formatTime(r.record.checkInAt)}` })),
    ...missing.map((r) => ({ key: `out-${r.employee.id}`, text: `${r.employee.name} has not checked out yet` })),
  ];
  const [open, setOpen] = useState(false);

  return (
    <div className="dropdown">
      <button
        type="button"
        className="topbar__bell"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${items.length ? `, ${items.length} new` : ''}`}
        aria-expanded={open}
      >
        <Bell aria-hidden="true" />
        {items.length > 0 && <span className="topbar__badge" />}
      </button>
      {open && (
        <div className="dropdown__menu dropdown__menu--end notifications" role="dialog" aria-label="Notifications" onMouseLeave={() => setOpen(false)}>
          <p className="notifications__title">Today</p>
          {items.length === 0 ? (
            <p className="muted notifications__empty">No late arrivals or pending check-outs.</p>
          ) : (
            <ul>
              {items.slice(0, 8).map((item) => (
                <li key={item.key}>{item.text}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Topbar({ onMenu }) {
  const { admin, today, date, setDate, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const datePages = location.pathname === '/' || location.pathname.startsWith('/attendance');

  return (
    <header className="topbar">
      <button type="button" className="icon-btn topbar__menu" onClick={onMenu} aria-label="Open menu">
        <MenuIcon aria-hidden="true" />
      </button>
      <form
        className="topbar__search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`/employees${qs({ q: query.trim() })}`);
        }}
      >
        <Search aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, employee ID or department…"
          aria-label="Search employees"
        />
      </form>

      <div className="topbar__right">
        {datePages && date && (
          <label className="topbar__date">
            <CalendarDays aria-hidden="true" />
            <span>{formatLongDate(date)}</span>
            <ChevronDown aria-hidden="true" className="topbar__chevron" />
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              aria-label="Choose date"
            />
          </label>
        )}
        <Notifications />
        <Menu
          trigger={(props) => (
            <button type="button" className="topbar__user" {...props}>
              <Avatar name={admin.name} size="sm" />
              <span className="topbar__user-name">{admin.name}</span>
              <ChevronDown aria-hidden="true" />
            </button>
          )}
          items={[
            { label: 'Account & security', Icon: UserRound, onSelect: () => navigate('/settings?tab=account') },
            null,
            {
              label: 'Sign out',
              Icon: LogOut,
              tone: 'danger',
              onSelect: () => logout().catch((e) => toast.error(e.message)),
            },
          ]}
        />
      </div>
    </header>
  );
}

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <div className="shell">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="main">
        <Topbar onMenu={() => setMenuOpen(true)} />
        <main key={pathname} className="content route-enter">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
