interface BarSeries {
  name: string;
  color: string;
  values: number[];
}

interface BarChartProps {
  categories: string[];
  series: BarSeries[];
  title?: string;
}

const W = 480;
const H = 220;
const PAD = { top: 20, right: 20, bottom: 40, left: 64 };
const chartW = W - PAD.left - PAD.right;
const chartH = H - PAD.top - PAD.bottom;

export default function BarChart({ categories, series, title }: BarChartProps) {
  const allValues = series.flatMap(s => s.values);
  const maxVal = Math.max(...allValues, 1);
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => (maxVal / tickCount) * i);

  const groupW = chartW / categories.length;
  const barW = Math.min((groupW / series.length) * 0.7, 40);
  const barGap = barW * 0.2;

  const yScale = (v: number) => chartH - (v / maxVal) * chartH;

  const fmt = (v: number) => v >= 1_000_000 ? `£${(v / 1_000_000).toFixed(1)}m` : `£${(v / 1000).toFixed(0)}k`;

  return (
    <div>
      {title && <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</p>}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {/* Y gridlines + labels */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={0} y1={yScale(t)} x2={chartW} y2={yScale(t)} stroke="#f3f4f6" strokeWidth="1" />
              <text x={-6} y={yScale(t) + 4} textAnchor="end" fill="#9ca3af" style={{ fontSize: 9 }}>
                {fmt(t)}
              </text>
            </g>
          ))}

          {/* Bars */}
          {categories.map((cat, ci) => {
            const groupX = ci * groupW + groupW / 2 - (series.length * (barW + barGap)) / 2;
            return (
              <g key={ci}>
                {series.map((s, si) => {
                  const bx = groupX + si * (barW + barGap);
                  const bh = Math.max(((s.values[ci] ?? 0) / maxVal) * chartH, 1);
                  const by = chartH - bh;
                  return (
                    <rect
                      key={si}
                      x={bx}
                      y={by}
                      width={barW}
                      height={bh}
                      fill={s.color}
                      rx="2"
                      opacity={0.9}
                    />
                  );
                })}
                {/* X label */}
                <text
                  x={ci * groupW + groupW / 2}
                  y={chartH + 16}
                  textAnchor="middle"
                  fill="#6b7280"
                  style={{ fontSize: 10 }}
                >
                  {cat}
                </text>
              </g>
            );
          })}

          {/* Axes */}
          <line x1={0} y1={0} x2={0} y2={chartH} stroke="#e5e7eb" strokeWidth="1" />
          <line x1={0} y1={chartH} x2={chartW} y2={chartH} stroke="#e5e7eb" strokeWidth="1" />
        </g>

        {/* Legend */}
        <g transform={`translate(${PAD.left}, ${H - 10})`}>
          {series.map((s, i) => (
            <g key={i} transform={`translate(${i * 130}, 0)`}>
              <rect x={0} y={-7} width={10} height={10} fill={s.color} rx="1" />
              <text x={14} y={2} fill="#6b7280" style={{ fontSize: 9 }}>
                {s.name}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
