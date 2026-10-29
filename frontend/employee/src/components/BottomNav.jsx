import { History, House, User } from 'lucide-react';
import { Link, useLocation } from 'react-router';

const ITEMS = [
  { to: '/', label: 'Home', Icon: House, isActive: (path) => path === '/' },
  {
    to: '/history',
    label: 'History',
    Icon: History,
    isActive: (path) => path.startsWith('/history') || path.startsWith('/summary'),
  },
  { to: '/profile', label: 'Profile', Icon: User, isActive: (path) => path.startsWith('/profile') },
];

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="bottom-nav" aria-label="Main">
      {ITEMS.map(({ to, label, Icon, isActive }) => {
        const active = isActive(pathname);
        return (
          <Link
            key={to}
            to={to}
            className={`bottom-nav__item${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon aria-hidden="true" strokeWidth={active ? 2.4 : 1.9} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
