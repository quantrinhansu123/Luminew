import KpiCard from './KpiCard';
import MetricTable from './MetricTable';
import MiniTrendChart from './MiniTrendChart';
import StatusBadge from './StatusBadge';
import { DEPARTMENT_FILTERS, formatByType } from '../../../utils/dashboardDieuHanhMetrics';

function chartValue(metric, raw) {
  if (metric.format === 'percent') return Number(((raw || 0) * 100).toFixed(2));
  if (metric.format === 'money') return Number(((raw || 0) / 1_000_000_000).toFixed(2));
  return Number(raw || 0);
}

function chartUnit(metric) {
  if (metric.format === 'percent') return '%';
  if (metric.format === 'money') return ' tỷ';
  return '';
}

export default function DepartmentTab({ data, department, setDepartment }) {
  const selected = data.selectedDepartment;

  return (
    <div className="space-y-4">
      <section className="lumi-dieu-hanh-panel rounded-lg border bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="lumi-section-title">Chọn team</span>
            <select
              value={data.selectedDepartmentValue}
              onChange={(e) => setDepartment(e.target.value)}
              className="h-9 rounded-md border px-3 text-sm font-bold"
            >
              {DEPARTMENT_FILTERS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <div className="flex flex-wrap gap-1">
              {DEPARTMENT_FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setDepartment(item.value)}
                  className={`rounded-full border px-3 py-1 text-xs font-bold ${
                    data.selectedDepartmentValue === item.value
                      ? 'border-[#2864d9] bg-gradient-to-r from-[#2864d9] to-[#55dbe8] text-white'
                      : 'border-[#e2eaf4] bg-white text-[#69768c] hover:border-[#55dbe8] hover:text-[#2864d9]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="text-xs font-bold text-[#69768c]">Đang xem: {selected.label}</div>
        </div>
      </section>

      <section className="lumi-dieu-hanh-panel rounded-lg border bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="lumi-section-title">KPI bộ phận - {selected.label}</h2>
          {selected.risk ? <StatusBadge level="warn">Có cảnh báo</StatusBadge> : <StatusBadge>Ổn định</StatusBadge>}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {selected.metrics.map((metric) => (
            <KpiCard
              key={metric.label}
              label={metric.label}
              display={metric.value}
              status={metric.danger ? 'danger' : 'good'}
              note={metric.threshold == null ? 'Theo dữ liệu thật' : `${metric.direction === 'max' ? 'Cảnh báo khi >' : 'Cảnh báo khi <'} ${formatByType(metric.threshold, metric.format)}`}
            />
          ))}
        </div>
      </section>

      <section className="lumi-dieu-hanh-panel rounded-lg border bg-white p-3 shadow-sm">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="lumi-section-title">Xu hướng {selected.label} - 4 kỳ gần nhất</h2>
          <span className="text-xs font-bold text-[#69768c]">Mỗi biểu đồ là một KPI bộ phận</span>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          {selected.metrics.map((metric) => (
            <MiniTrendChart
              key={metric.label}
              title={metric.label}
              labels={data.departmentPeriodRows.map((row) => row.label)}
              values={data.departmentPeriodRows.map((row) => chartValue(metric, row.metrics.find((m) => m.label === metric.label)?.raw || 0))}
              threshold={metric.threshold == null ? null : chartValue(metric, metric.threshold)}
              unit={chartUnit(metric)}
              danger={data.departmentPeriodRows.some((row) => row.metrics.find((m) => m.label === metric.label)?.danger)}
            />
          ))}
        </div>
      </section>

      <MetricTable title={`Bảng tăng trưởng - ${selected.label}`} aside={department === 'all' ? 'Mặc định MKT' : '4 kỳ gần nhất'}>
        <table className="lumi-compact-table min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Kỳ</th>
              <th className="px-3 py-2">Team</th>
              {selected.metrics.map((metric) => (
                <th key={metric.label} className="px-3 py-2 text-right">{metric.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.departmentPeriodRows.map((row, index) => (
              <tr key={row.key} className={index === data.departmentPeriodRows.length - 1 ? 'bg-[#f1fbff]' : 'bg-white'}>
                <td className="px-3 py-3 font-black text-[#2864d9]">{row.label}</td>
                <td className="px-3 py-3 font-black text-[#202534]">{selected.label}</td>
                {row.metrics.map((metric) => (
                  <td key={metric.label} className={`px-3 py-3 text-right font-black ${metric.danger ? 'bg-red-50 text-red-700' : 'text-[#202534]'}`}>
                    {metric.value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </MetricTable>
    </div>
  );
}
