import { useEffect, useId, useRef, useState } from 'react';

/**
 * Dropdown menu. `trigger` renders the button (receives props to spread);
 * `items`: [{ label, Icon, onSelect, tone, disabled }] or null for a divider.
 */
export function Menu({ trigger, items, align = 'end', label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="dropdown" ref={ref}>
      {trigger({
        onClick: () => setOpen((v) => !v),
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': id,
        'aria-label': label,
      })}
      {open && (
        <div className={`dropdown__menu dropdown__menu--${align}`} role="menu" id={id}>
          {items.filter((item) => item !== false).map((item, i) =>
            item === null ? (
              <hr key={`divider-${i}`} className="dropdown__divider" />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`dropdown__item${item.tone ? ` dropdown__item--${item.tone}` : ''}`}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.Icon && <item.Icon aria-hidden="true" />}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
