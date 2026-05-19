export default function StatusBadge({ level = 'ok', children }) {
  const cls =
    level === 'bad' || level === 'danger'
      ? 'border-red-200 bg-red-50 text-red-700'
      : level === 'warn'
        ? 'border-orange-200 bg-orange-50 text-orange-700'
        : 'border-cyan-200 bg-cyan-50 text-[#2864d9]';

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${cls}`}>
      {children}
    </span>
  );
}
