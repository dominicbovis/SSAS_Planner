interface LineSeries {
  name: string;
  color: string;
  values: number[];
  dashed?: boolean;
}

interface LineChartProps {
  labels: string[];
  series: LineSeries[];
  title?: string;
}

const W = 600;
const H = 240;
const PAD = { top: 20, right: 24, bottom: 48, left: 72 };
const chartW = W - PAD.left - PAD.right;
const chartH = H - PAD.top - PAD.bottom;

function fmt(v: number) {
  if (v < 0) return `-£${Math.abs(v / 1000).toFixed(0)}k`;
  return v >= 1_000_000 ? `£${(v / 1_000_000).toFixed(1)}m` : `£${(v / 1000).toFixed(0)}k`;
}

export default function LineChart({ labels, series, title }: LineChartProps) {
  const allValues = series.flatMap(s => s.values);
  const minVal = Math.min(...allValues, 0);
  const maxVal = Math.max(...allValues, 1);
  const range = maxVal - minVal || 1;
  const n = labels.length;
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => minVal + (range / tickCount) * i);

  const xScale = (i: number) => (i / Math.max(n - 1, 1)) * chartW;
  const yScale = (v: number) => chartH - ((v - minVal) / range) * chartH;

  const showEvery = Math.ceil(n / 12);

  return (
    <div>
      {title && <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</p>}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {/* Zero line if negative values exist */}
          {minVal < 0 && (
            <line x1={0} y1={yScale(0)} x2={chartW} y2={yScale(0)} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4,2" />
          )}

          {/* Y gridlines + labels */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={0} y1={yScale(t)} x2={chartW} y2={yScale(t)} stroke="#f3f4f6" strokeWidth="1" />
              <text x={-8} y={yScale(t) + 4} textAnchor="end" fill="#9ca3af" style={{ fontSize: 9 }}>
                {fmt(t)}
              </text>
            </g>
          ))}

          {/* Lines */}
          {series.map((s, si) => {
            const points = s.values.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ');
            return (
              <g key={si}>
                <polyline
                  points={points}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeDasharray={s.dashed ? '6,3' : undefined}
                />
                {s.values.map((v, i) => (
                  <circle key={i} cx={xScale(i)} cy={yScale(v)} r={2.5} fill={s.color} />
                ))}
              </g>
            );
          })}

          {/* X labels */}
          {labels.map((l, i) => {
            if (i % showEvery !== 0 && i !== n - 1) return null;
            return (
              <text
                key={i}
                x={xScale(i)}
                y={chartH + 18}
                textAnchor="middle"
                fill="#6b7280"
                style={{ fontSize: 9 }}
                transform={`rotate(-30, ${xScale(i)}, ${chartH + 18})`}
              >
                {l}
              </text>
            );
          })}

          {/* Axes */}
          <line x1={0} y1={0} x2={0} y2={chartH} stroke="#e5e7eb" strokeWidth="1" />
          <line x1={0} y1={chartH} x2={chartW} y2={chartH} stroke="#e5e7eb" strokeWidth="1" />
        </g>

        {/* Legend */}
        <g transform={`translate(${PAD.left}, ${H - 8})`}>
          {series.map((s, i) => (
            <g key={i} transform={`translate(${i * 160}, 0)`}>
              <line x1={0} y1={-4} x2={16} y2={-4} stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '6,3' : undefined} />
              <text x={20} y={0} fill="#6b7280" style={{ fontSize: 9 }}>
                {s.name}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
