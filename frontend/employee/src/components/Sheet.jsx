import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

/** Bottom sheet built on <dialog>: focus trapping and Escape-to-close come for free. */
export function Sheet({ open, title, onClose, children }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="sheet__panel">
        <span className="sheet__handle" aria-hidden="true" />
        <header className="sheet__header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X aria-hidden="true" />
          </button>
        </header>
        {open && children}
      </div>
    </dialog>
  );
}
