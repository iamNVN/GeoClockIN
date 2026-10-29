// Decorative SVG illustration for the splash screen. aria-hidden; text carries the meaning.

const WINDOW = '#8db4e6';
const WALL = '#f7faff';
const WALL_EDGE = '#cddbec';
const BACK_BUILDING = '#dfe8f3';

function grid({ x, y, cols, rows, dx, dy, w = 10, h = 10 }) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push(<rect key={`${r}-${c}`} x={x + c * dx} y={y + r * dy} width={w} height={h} rx="1.5" fill={WINDOW} />);
    }
  }
  return cells;
}

function Tree({ x, base, size = 1, className }) {
  return (
    <g transform={`translate(${x} ${base}) scale(${size})`}>
      <g className={className}>
        <rect x="-1.6" y="-14" width="3.2" height="14" rx="1.2" fill="#8a6a4f" />
        <ellipse cx="0" cy="-24" rx="9" ry="13" fill="#5fbf86" />
        <ellipse cx="2.5" cy="-27" rx="5" ry="8" fill="#7fd09f" />
      </g>
    </g>
  );
}

const PIN_PATH = 'M32 2C17.6 2 6 13.4 6 27.6 6 47 32 72 32 72s26-25 26-44.4C58 13.4 46.4 2 32 2z';

/** Office building with trees and a bobbing location pin. */
export function OfficeScene({ className }) {
  return (
    <svg className={`office-scene ${className ?? ''}`} viewBox="0 0 300 200" aria-hidden="true">
      <ellipse cx="150" cy="118" rx="140" ry="78" fill="#eef7f2" />
      <ellipse className="office-scene__cloud" cx="62" cy="64" rx="30" ry="12" fill="#fff" />
      <ellipse className="office-scene__cloud office-scene__cloud--slow" cx="246" cy="52" rx="26" ry="10" fill="#fff" />

      <rect x="58" y="104" width="50" height="74" rx="3" fill={BACK_BUILDING} />
      {grid({ x: 65, y: 113, cols: 2, rows: 4, dx: 15, dy: 15 })}
      <rect x="194" y="94" width="50" height="84" rx="3" fill={BACK_BUILDING} />
      {grid({ x: 207, y: 104, cols: 2, rows: 5, dx: 15, dy: 14 })}

      <rect x="100" y="72" width="100" height="106" rx="4" fill={WALL} stroke={WALL_EDGE} strokeWidth="1.5" />
      <rect x="96" y="66" width="108" height="10" rx="3" fill={WALL_EDGE} />
      {grid({ x: 110, y: 84, cols: 5, rows: 4, dx: 17, dy: 15, w: 12 })}
      <rect x="138" y="148" width="24" height="30" rx="2" fill={WINDOW} />
      <line x1="150" y1="148" x2="150" y2="178" stroke={WALL} strokeWidth="1.5" />

      <Tree x={42} base={178} size={1.1} className="office-scene__tree" />
      <Tree x={88} base={178} size={0.8} className="office-scene__tree office-scene__tree--alt" />
      <Tree x={214} base={178} size={0.75} className="office-scene__tree" />
      <Tree x={262} base={178} size={1.15} className="office-scene__tree office-scene__tree--alt" />
      <rect x="18" y="176" width="264" height="6" rx="3" fill="#d4e1da" />

      <ellipse className="office-scene__shadow" cx="150" cy="62" rx="9" ry="2.5" fill="#0f9d69" opacity="0.18" />
      <g className="office-scene__pin">
        <g transform="translate(129 6) scale(0.66)">
          <path d={PIN_PATH} fill="#1db27a" />
          <circle cx="32" cy="27.5" r="13" fill="#fff" />
        </g>
      </g>
    </svg>
  );
}
