/** Shimmering placeholder block. */
export function Skeleton({ width = '100%', height = 14, radius, circle = false, className = '', style }) {
  return (
    <span
      className={`skeleton ${className}`}
      style={{ width, height: circle ? width : height, borderRadius: circle ? '50%' : radius, ...style }}
      aria-hidden="true"
    />
  );
}

/** Placeholder for a list of DayRow items. */
export function DayRowsSkeleton({ rows = 3 }) {
  return Array.from({ length: rows }, (_, i) => (
    <div key={i} className="day-row day-row--skeleton" aria-hidden="true">
      <Skeleton width={44} height={48} radius={14} />
      <span className="day-row__body">
        <Skeleton width="62%" height={14} />
        <Skeleton width="40%" height={12} />
      </span>
      <Skeleton width={58} height={24} radius={999} />
    </div>
  ));
}
