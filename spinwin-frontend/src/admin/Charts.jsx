import { branding } from "../branding";

export function Bars({ data, height = 180, color = branding.wheelColors[0] }) {
  if (!data || !data.length) return <Empty />;
  const max = Math.max(...data.map((d) => d.value), 1);
  const bw = 100 / data.length;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="chart-svg" style={{ height }}>
      {data.map((d, i) => {
        const h = (d.value / max) * (height - 26);
        return (
          <g key={i}>
            <rect x={i * bw + bw * 0.15} y={height - 22 - h} width={bw * 0.7} height={h}
                  rx="1.5" fill={color} />
            <text x={i * bw + bw / 2} y={height - 22 - h - 3} textAnchor="middle" className="chart-val">{d.value}</text>
            <text x={i * bw + bw / 2} y={height - 8} textAnchor="middle" className="chart-lbl">
              {String(d.label).length > 10 ? String(d.label).slice(0, 9) + "\u2026" : d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Line({ data, height = 180, color = branding.wheelColors[2] }) {
  if (!data || !data.length) return <Empty />;
  const max = Math.max(...data.map((d) => d.value), 1);
  const step = data.length > 1 ? 100 / (data.length - 1) : 0;
  const pts = data.map((d, i) => `${i * step},${height - 24 - (d.value / max) * (height - 34)}`).join(" ");
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="chart-svg" style={{ height }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {data.map((d, i) => (
        <circle key={i} cx={i * step} cy={height - 24 - (d.value / max) * (height - 34)} r="1.4" fill={color} />
      ))}
    </svg>
  );
}

export function StackBars({ data, height = 180 }) {
  // data: [{label, remaining, initial}] -> remaining vs used
  if (!data || !data.length) return <Empty />;
  const max = Math.max(...data.map((d) => d.initial), 1);
  const bw = 100 / data.length;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="chart-svg" style={{ height }}>
      {data.map((d, i) => {
        const th = (d.initial / max) * (height - 26);
        const rh = (d.remaining / max) * (height - 26);
        const x = i * bw + bw * 0.15;
        const w = bw * 0.7;
        return (
          <g key={i}>
            <rect x={x} y={height - 22 - th} width={w} height={th} rx="1.5" fill="#3a2e6b" />
            <rect x={x} y={height - 22 - rh} width={w} height={rh} rx="1.5" fill={branding.wheelColors[5]} />
            <text x={x + w / 2} y={height - 8} textAnchor="middle" className="chart-lbl">
              {String(d.label).length > 10 ? String(d.label).slice(0, 9) + "\u2026" : d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Empty() {
  return <div className="chart-empty">No data yet</div>;
}
