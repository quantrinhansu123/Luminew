export default function MetricTable({ title, aside, children }) {
  return (
    <section className="lumi-metric-table rounded-lg border border-[#e2eaf4] bg-white p-3 shadow-sm">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="lumi-section-title">{title}</h2>
        {aside && <div className="text-xs font-bold text-[#69768c]">{aside}</div>}
      </div>
      <div className="overflow-auto">{children}</div>
    </section>
  );
}
