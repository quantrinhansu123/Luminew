import { Line } from 'react-chartjs-2';

export default function MiniTrendChart({ title, labels, values, threshold, unit = '', danger, color = '#2864d9' }) {
  const datasets = [
    {
      label: title,
      data: values,
      borderColor: danger ? '#e5484d' : color,
      backgroundColor: danger ? 'rgba(229, 72, 77, 0.10)' : 'rgba(85, 219, 232, 0.14)',
      borderWidth: 2,
      fill: true,
      pointRadius: 2,
      pointHoverRadius: 4,
      tension: 0.35,
    },
  ];

  if (threshold != null) {
    datasets.push({
      label: 'Ngưỡng',
      data: Array.from({ length: values.length }, () => threshold),
      borderColor: '#ff8a1f',
      borderDash: [5, 4],
      borderWidth: 1.5,
      fill: false,
      pointRadius: 0,
      tension: 0,
    });
  }

  return (
    <div className={`lumi-chart-card rounded-lg border p-2.5 shadow-sm ${danger ? 'border-red-200 bg-red-50/40' : 'border-[#e2eaf4] bg-white'}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="truncate text-[9px] font-black uppercase tracking-wide text-[#2864d9]">{title}</div>
        {threshold != null && <div className="text-[11px] font-bold text-orange-700">Ngưỡng {threshold}{unit}</div>}
      </div>
      <div className="h-[105px]">
        <Line
          data={{ labels, datasets }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (item) => ` ${item.dataset.label}: ${item.raw}${unit}`,
                },
              },
            },
            scales: {
              x: { grid: { color: 'rgba(203, 213, 225, 0.35)' }, ticks: { font: { size: 10 } } },
              y: { beginAtZero: true, grid: { color: 'rgba(203, 213, 225, 0.35)' }, ticks: { font: { size: 10 }, callback: (v) => `${v}${unit}` } },
            },
          }}
        />
      </div>
    </div>
  );
}
