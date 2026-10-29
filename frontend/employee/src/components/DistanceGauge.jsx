import { useEntered } from '../hooks/useEntered.js';

// The track spans 0 → 1.5 × radius, so the allowed zone fills two thirds of it.
const TRACK_SPAN = 1.5;

/** Linear gauge of the distance from the office against the allowed radius. */
export function DistanceGauge({ distance, radius, tone }) {
  const entered = useEntered(120);
  const zone = 100 / TRACK_SPAN;
  const position = distance == null ? 0 : Math.min(distance / (radius * TRACK_SPAN), 1) * 100;

  return (
    <div className={`gauge gauge--${tone}`} aria-hidden="true">
      <div className="gauge__track">
        <span className="gauge__zone" style={{ width: `${zone}%` }} />
        <span className="gauge__boundary" style={{ left: `${zone}%` }} />
        {distance != null && (
          <span className="gauge__marker" style={{ left: `${entered ? position : 0}%` }}>
            <span className="gauge__dot" />
          </span>
        )}
      </div>
      <div className="gauge__scale">
        <span>Office</span>
        <span className="gauge__radius" style={{ left: `${zone}%` }}>
          {radius} m
        </span>
      </div>
    </div>
  );
}
