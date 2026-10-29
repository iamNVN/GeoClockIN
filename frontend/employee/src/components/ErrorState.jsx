import { CircleAlert, RefreshCw } from 'lucide-react';

export function ErrorState({ error, onRetry }) {
  return (
    <div className="error-state" role="alert">
      <CircleAlert className="error-state__icon" aria-hidden="true" />
      <p>{error?.message ?? 'Something went wrong.'}</p>
      {onRetry && (
        <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
          <RefreshCw aria-hidden="true" /> Try again
        </button>
      )}
    </div>
  );
}
