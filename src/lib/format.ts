const GBP_0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const GBP_2 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fmt(v: number): string {
  return GBP_0.format(v);
}

export function fmtFull(v: number): string {
  return GBP_2.format(v);
}

export function fmtCompact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `£${(v / 1_000_000).toFixed(1)}m`;
  if (Math.abs(v) >= 1_000) return `£${(v / 1_000).toFixed(0)}k`;
  return GBP_0.format(v);
}
