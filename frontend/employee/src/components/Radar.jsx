import { Building2 } from 'lucide-react';

// Layout, as a percentage of the radar's diameter measured from its centre:
const OFFICE_EDGE = 15; // the office icon
const FENCE = 28; // the geofence ring
const OUTER = 46; // furthest a "you" dot is drawn
const ANGLE = (-38 * Math.PI) / 180;

/** Where to draw the employee relative to the office. Illustrative, not to scale. */
function youPosition(distance, radius) {
  const ratio = distance / radius;
  const r =
    ratio <= 1 ? OFFICE_EDGE + ratio * (FENCE - OFFICE_EDGE) : FENCE + Math.min(ratio - 1, 1) * (OUTER - FENCE);
  return { left: `${50 + r * Math.cos(ANGLE)}%`, top: `${50 + r * Math.sin(ANGLE)}%` };
}

/**
 * Office at the centre, the geofence as a dashed ring and the employee as a dot.
 * tone: pending (sweeping) | success | warning | danger | neutral
 */
export function Radar({ tone = 'pending', distance = null, radius = 1 }) {
  return (
    <div className={`radar radar--${tone}`} aria-hidden="true">
      <span className="radar__ring radar__ring--outer" />
      <span className="radar__ring radar__ring--mid" />
      <span className="radar__fence" />
      {tone === 'pending' && <span className="radar__sweep" />}
      <span className="radar__ripple" />
      <span className="radar__office">
        <Building2 />
      </span>
      {distance != null && (
        <span key={tone} className="radar__you" style={youPosition(distance, radius)}>
          <span className="radar__you-pulse" />
        </span>
      )}
    </div>
  );
}
