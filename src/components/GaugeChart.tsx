interface GaugeChartProps {
  value: number;
  max: number;
  label: string;
  color: 'red' | 'amber' | 'green';
  formatValue?: (v: number) => string;
}

export default function GaugeChart({ value, max, label, color, formatValue }: GaugeChartProps) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const angle = pct * 180;

  const cx = 110;
  const cy = 110;
  const r = 85;

  function polarToXY(deg: number) {
    const rad = ((deg - 180) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  }

  const start = polarToXY(0);
  const end = polarToXY(angle);
  const largeArc = angle > 180 ? 1 : 0;

  const colorMap = {
    green: { track: '#d1fae5', fill: '#10b981', text: '#065f46' },
    amber: { track: '#fef3c7', fill: '#f59e0b', text: '#78350f' },
    red: { track: '#fee2e2', fill: '#ef4444', text: '#7f1d1d' },
  };

  const c = colorMap[color];
  const fmt = formatValue ?? ((v: number) => `£${v.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`);
  const usedPct = (pct * 100).toFixed(1);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 220 130" className="w-full max-w-[220px]">
        {/* Track arc */}
        <path
          d={`M ${polarToXY(0).x} ${polarToXY(0).y} A ${r} ${r} 0 0 1 ${polarToXY(180).x} ${polarToXY(180).y}`}
          fill="none"
          stroke={c.track}
          strokeWidth="16"
          strokeLinecap="round"
        />
        {/* Value arc */}
        {pct > 0 && (
          <path
            d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`}
            fill="none"
            stroke={c.fill}
            strokeWidth="16"
            strokeLinecap="round"
          />
        )}
        {/* Center text */}
        <text x={cx} y={cy - 4} textAnchor="middle" className="font-bold" fill={c.text} style={{ fontSize: 18, fontWeight: 700 }}>
          {fmt(value)}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fill="#6b7280" style={{ fontSize: 11 }}>
          {usedPct}% used
        </text>
        {/* Min / Max labels */}
        <text x={polarToXY(0).x - 8} y={cy + 18} textAnchor="end" fill="#9ca3af" style={{ fontSize: 9 }}>
          £0
        </text>
        <text x={polarToXY(180).x + 8} y={cy + 18} textAnchor="start" fill="#9ca3af" style={{ fontSize: 9 }}>
          {fmt(max)}
        </text>
      </svg>
      <p className="text-xs font-semibold text-gray-600 text-center mt-1 leading-tight">{label}</p>
    </div>
  );
}
