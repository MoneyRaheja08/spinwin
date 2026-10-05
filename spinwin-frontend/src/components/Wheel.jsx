import { useMemo } from "react";
import { branding } from "../branding";

// angle measured in degrees from the top (12 o'clock), clockwise
function pointAt(cx, cy, r, angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

function segmentPath(cx, cy, r, a0, a1) {
  const [x0, y0] = pointAt(cx, cy, r, a0);
  const [x1, y1] = pointAt(cx, cy, r, a1);
  const largeArc = a1 - a0 > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1} Z`;
}

export default function Wheel({ segments, rotation, duration, spinning }) {
  const size = 620;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;
  const colors = branding.wheelColors;
  const n = Math.max(segments.length, 1);
  const seg = 360 / n;

  // font size that keeps even long names inside their slice
  const baseFs = n <= 6 ? 23 : n <= 8 ? 19 : n <= 10 ? 16 : n <= 12 ? 14 : 12;
  const usableLen = r * 0.60; // from ~0.33r to ~0.93r along the spoke

  const slices = useMemo(() => {
    return segments.map((s, i) => {
      const a0 = i * seg;
      const a1 = (i + 1) * seg;
      const mid = a0 + seg / 2;
      const aRad = (mid * Math.PI) / 180;
      const dx = Math.sin(aRad), dy = -Math.cos(aRad);
      const rightHalf = dx >= 0;
      let rot = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (!rightHalf) rot += 180;
      const ri = r * 0.33;
      const [tx, ty] = pointAt(cx, cy, ri, mid);
      const name = (s.name || "").length > 20 ? s.name.slice(0, 19) + "…" : (s.name || "");
      // shrink font further if the name is long
      const fitFs = Math.floor(usableLen / (0.58 * Math.max(name.length, 1)));
      const fs = Math.max(11, Math.min(baseFs, fitFs));
      return { s, i, a0, a1, mid, tx, ty, rot, anchor: rightHalf ? "start" : "end",
               name, fs, color: colors[i % colors.length] };
    });
  }, [segments, seg, r]);

  return (
    <div className="wheel-wrap">
      <div className="wheel-pointer" aria-hidden />
      <div
        className="wheel-spinner"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? `transform ${duration}s cubic-bezier(0.16, 0.84, 0.30, 1)` : "none",
        }}
      >
        <svg viewBox={`0 0 ${size} ${size}`} className="wheel-svg">
          <defs>
            <filter id="wheelGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="10" floodColor="#F5B301" floodOpacity="0.55" />
            </filter>
          </defs>
          <circle cx={cx} cy={cy} r={r + 6} fill="#120a2e" stroke="#F5B301" strokeWidth="6" filter="url(#wheelGlow)" />
          {slices.map(({ i, a0, a1, tx, ty, rot, anchor, name, fs, color }) => (
            <g key={i}>
              <path d={segmentPath(cx, cy, r, a0, a1)} fill={color} stroke="#120a2e" strokeWidth="3" />
              <text
                x={tx} y={ty} textAnchor={anchor} dominantBaseline="middle"
                transform={`rotate(${rot} ${tx} ${ty})`}
                className="wheel-label" style={{ fontSize: `${fs}px` }}
              >
                {name}
              </text>
            </g>
          ))}
          <circle cx={cx} cy={cy} r={62} fill="#120a2e" stroke="#F5B301" strokeWidth="5" />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" className="wheel-hub">
            {branding.currency}
          </text>
        </svg>
      </div>
    </div>
  );
}

// Rotation that brings segment `index` (of `count`) under the top pointer,
// after `spins` full turns. Exported so the TV page can compute the target.
export function targetRotation(index, count, spins = 6) {
  const seg = 360 / Math.max(count, 1);
  const center = index * seg + seg / 2;
  return spins * 360 - center;
}
