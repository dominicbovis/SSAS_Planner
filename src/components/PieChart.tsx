interface PieSlice {
  label: string;
  value: number;
  color: string;
}

interface PieChartProps {
  slices: PieSlice[];
  title?: string;
}

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export default function PieChart({ slices, title }: PieChartProps) {
  const total = slices.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No data</div>
    );
  }

  const cx = 110;
  const cy = 110;
  const r = 80;
  const ir = 44;

  let cumAngle = 0;
  const paths = slices
    .filter(s => s.value > 0)
    .map(slice => {
      const pct = slice.value / total;
      const startAngle = cumAngle;
      const endAngle = cumAngle + pct * 360;
      cumAngle = endAngle;

      const s = polarToXY(cx, cy, r, startAngle);
      const e = polarToXY(cx, cy, r, endAngle);
      const si = polarToXY(cx, cy, ir, startAngle);
      const ei = polarToXY(cx, cy, ir, endAngle);
      const large = pct > 0.5 ? 1 : 0;

      const d = [
        `M ${s.x} ${s.y}`,
        `A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`,
        `L ${ei.x} ${ei.y}`,
        `A ${ir} ${ir} 0 ${large} 0 ${si.x} ${si.y}`,
        'Z',
      ].join(' ');

      return { d, color: slice.color, label: slice.label, value: slice.value, pct };
    });

  return (
    <div>
      {title && <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</p>}
      <div className="flex gap-4 items-start">
        <svg viewBox="0 0 220 220" className="w-44 shrink-0">
          {paths.map((p, i) => (
            <path key={i} d={p.d} fill={p.color} stroke="white" strokeWidth="2" />
          ))}
          <text x={cx} y={cy - 6} textAnchor="middle" fill="#374151" style={{ fontSize: 11, fontWeight: 600 }}>
            Total
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" fill="#374151" style={{ fontSize: 10 }}>
            £{(total / 1000).toFixed(0)}k
          </text>
        </svg>
        <div className="flex flex-col gap-1 pt-2">
          {slices.filter(s => s.value > 0).map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
              <span className="text-gray-600 truncate max-w-[120px]">{s.label}</span>
              <span className="text-gray-800 font-medium ml-auto">£{(s.value / 1000).toFixed(0)}k</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
