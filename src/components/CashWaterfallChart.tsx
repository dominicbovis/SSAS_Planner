export interface WaterfallStep {
  label: string;
  delta: number;
  runningTotal: number;
  type: 'base' | 'change' | 'total';
}

interface CashWaterfallChartProps {
  steps: WaterfallStep[];
}

const W = 520;
const H = 220;
const PAD = { top: 24, right: 24, bottom: 44, left: 72 };
const chartW = W - PAD.left - PAD.right;
const chartH = H - PAD.top - PAD.bottom;

function fmt(v: number) {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(2)}m`;
  if (abs >= 1_000) return `${sign}£${(abs / 1_000).toFixed(0)}k`;
  return `${sign}£${abs.toFixed(0)}`;
}

export default function CashWaterfallChart({ steps }: CashWaterfallChartProps) {
  if (steps.length === 0) return null;

  const allValues = steps.map(s => s.runningTotal);
  const minVal = Math.min(0, ...allValues);
  const maxVal = Math.max(...allValues, 1);
  const range = maxVal - minVal || 1;

  // Y: 0 at bottom when minVal >= 0, else shift to accommodate negatives
  const yScale = (v: number) => chartH - ((v - minVal) / range) * chartH;
  const zeroY = yScale(0);

  const tickCount = 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => minVal + (range / tickCount) * i);

  const barW = Math.min(chartW / steps.length * 0.5, 52);
  const groupW = chartW / steps.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <g transform={`translate(${PAD.left},${PAD.top})`}>
        {/* Gridlines + Y labels */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={0} y1={yScale(t)} x2={chartW} y2={yScale(t)} stroke="#f3f4f6" strokeWidth="1" />
            <text x={-6} y={yScale(t) + 4} textAnchor="end" fill="#9ca3af" style={{ fontSize: 9 }}>
              {fmt(t)}
            </text>
          </g>
        ))}

        {/* Zero line (if visible) */}
        {minVal < 0 && (
          <line x1={0} y1={zeroY} x2={chartW} y2={zeroY} stroke="#ef4444" strokeWidth="1" strokeDasharray="4 3" opacity={0.6} />
        )}

        {/* Bars + connectors */}
        {steps.map((step, i) => {
          const cx = i * groupW + groupW / 2;
          const bx = cx - barW / 2;

          let barTop: number;
          let barBottom: number;
          let fillColor: string;
          let fillOpacity = 0.9;

          if (step.type === 'base' || step.type === 'total') {
            barTop = yScale(step.runningTotal);
            barBottom = zeroY;
            fillColor = step.type === 'total'
              ? (step.runningTotal < steps[0].runningTotal ? '#ef4444' : '#10b981')
              : '#3b82f6';
          } else {
            // change bar — floats at the running total before this step
            const prev = steps[i - 1].runningTotal;
            const curr = step.runningTotal;
            if (curr <= prev) {
              barTop = yScale(prev);
              barBottom = yScale(curr);
              fillColor = '#ef4444';
            } else {
              barTop = yScale(curr);
              barBottom = yScale(prev);
              fillColor = '#10b981';
            }
          }

          const barH = Math.max(Math.abs(barBottom - barTop), 2);
          const barY = Math.min(barTop, barBottom);

          // Connector line to next bar
          const nextStep = steps[i + 1];
          const connectorX1 = bx + barW;
          const connectorX2 = (i + 1) * groupW + groupW / 2 - barW / 2;
          const connectorY = step.type === 'base' || step.type === 'total'
            ? yScale(step.runningTotal)
            : yScale(step.runningTotal);

          // Value label on bar
          const labelY = barY - 4;

          return (
            <g key={i}>
              {/* Bar */}
              <rect
                x={bx}
                y={barY}
                width={barW}
                height={barH}
                fill={fillColor}
                rx="3"
                opacity={fillOpacity}
              />

              {/* Value label */}
              <text
                x={cx}
                y={Math.max(labelY, 10)}
                textAnchor="middle"
                fill={fillColor === '#3b82f6' ? '#1d4ed8' : fillColor === '#ef4444' ? '#b91c1c' : '#065f46'}
                style={{ fontSize: 8.5, fontWeight: 600 }}
              >
                {step.type === 'change'
                  ? (step.delta >= 0 ? '+' : '') + fmt(step.delta)
                  : fmt(step.runningTotal)}
              </text>

              {/* Connector to next step */}
              {nextStep && nextStep.type !== 'total' && (
                <line
                  x1={connectorX1}
                  y1={connectorY}
                  x2={connectorX2}
                  y2={connectorY}
                  stroke="#d1d5db"
                  strokeWidth="1"
                  strokeDasharray="3 2"
                />
              )}

              {/* X label */}
              <text
                x={cx}
                y={chartH + 14}
                textAnchor="middle"
                fill="#6b7280"
                style={{ fontSize: 9 }}
              >
                {step.label.length > 14 ? step.label.slice(0, 13) + '…' : step.label}
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
        {[
          { color: '#3b82f6', label: 'Base cash' },
          { color: '#ef4444', label: 'Cash outflow' },
          { color: '#10b981', label: 'Cash inflow / surplus' },
        ].map((item, i) => (
          <g key={i} transform={`translate(${i * 130}, 0)`}>
            <rect x={0} y={-7} width={10} height={10} fill={item.color} rx="1" opacity={0.9} />
            <text x={14} y={2} fill="#6b7280" style={{ fontSize: 9 }}>{item.label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
