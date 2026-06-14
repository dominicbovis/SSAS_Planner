interface StatusBadgeProps {
  status: 'OK' | 'Warning' | 'Breach' | string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const styles: Record<string, string> = {
    OK: 'bg-emerald-100 text-emerald-700',
    Warning: 'bg-amber-100 text-amber-700',
    Breach: 'bg-red-100 text-red-700',
  };
  const cls = styles[status] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}
