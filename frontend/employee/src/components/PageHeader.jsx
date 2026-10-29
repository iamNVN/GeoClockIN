import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';

/** Title bar with a back button. Falls back to `backTo` when there is no in-app history. */
export function PageHeader({ title, backTo = '/' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = () => (location.key === 'default' ? navigate(backTo, { replace: true }) : navigate(-1));

  return (
    <header className="page-header">
      <button type="button" className="icon-button" onClick={goBack} aria-label="Go back">
        <ArrowLeft aria-hidden="true" />
      </button>
      <h1 className="page-header__title">{title}</h1>
      <span className="page-header__spacer" />
    </header>
  );
}
