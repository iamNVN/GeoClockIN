import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Page numbers to show: first, last, and a window around the current page. */
function pageList(page, count) {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const pages = new Set([1, count, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (page >= count - 2) [count - 3, count - 2, count - 1].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= count).sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? ['…', p] : [p]));
}

export function Pagination({ page, pageSize, total, onChange, noun = 'records' }) {
  const count = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="pagination">
      <p className="pagination__info">
        Showing {from} to {to} of {total} {noun}
      </p>
      {count > 1 && (
        <nav className="pagination__pages" aria-label="Pages">
          <button type="button" className="page-btn" onClick={() => onChange(page - 1)} disabled={page === 1} aria-label="Previous page">
            <ChevronLeft aria-hidden="true" />
          </button>
          {pageList(page, count).map((p, i) =>
            p === '…' ? (
              <span key={`gap-${i}`} className="page-gap">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                className={`page-btn${p === page ? ' is-active' : ''}`}
                onClick={() => onChange(p)}
                aria-current={p === page ? 'page' : undefined}
              >
                {p}
              </button>
            ),
          )}
          <button type="button" className="page-btn" onClick={() => onChange(page + 1)} disabled={page === count} aria-label="Next page">
            <ChevronRight aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}

/** Slices `items` for the current page; resets to page 1 when the list shrinks. */
export function paginate(items, page, pageSize) {
  const count = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, count);
  return { current, rows: items.slice((current - 1) * pageSize, current * pageSize) };
}
