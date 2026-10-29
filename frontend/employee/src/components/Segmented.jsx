/** Segmented control with a sliding selection indicator. */
export function Segmented({ options, value, onChange, label }) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  return (
    <div className="segmented" role="group" aria-label={label} style={{ '--count': options.length, '--index': index }}>
      <span className="segmented__indicator" aria-hidden="true" />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={`segmented__option${active ? ' is-active' : ''}`}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.count != null && <span className="segmented__count">{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
