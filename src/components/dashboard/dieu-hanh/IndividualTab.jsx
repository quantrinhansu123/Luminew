import { Line } from 'react-chartjs-2';
import KpiCard from './KpiCard';
import MetricTable from './MetricTable';
import MiniTrendChart from './MiniTrendChart';
import SearchableFilterSelect from './SearchableFilterSelect';
import StatusBadge from './StatusBadge';
import { departmentLabel, formatMoney, formatNumber, formatPercent } from '../../../utils/dashboardDieuHanhMetrics';

const COLORS = ['#2864d9', '#55dbe8', '#44c5b6', '#ff8a1f', '#ffd447', '#7c5cff'];

export default function IndividualTab({ data, team, setTeam, person, setPerson }) {
  const allRows = data.allIndividualRows || data.individualRows;
  const rows = data.individualRows;
  const rankingRows = allRows.slice(0, 10);
  const maxRank = Math.max(...rankingRows.map((row) => Number(row.rankValue || 0)), 1);
  const selectedRow = (person !== 'all' && allRows.find((row) => row.label === person)) || allRows[0] || null;
  const selectedPeriod = selectedRow
    ? data.individualPeriodRows.find((row) => row.label === selectedRow.label) || data.individualPeriodRows[0]
    : null;

  const lineRows = person === 'all'
    ? rankingRows
        .slice(0, 5)
        .map((row) => data.individualPeriodRows.find((item) => item.label === row.label))
        .filter(Boolean)
    : data.individualPeriodRows;
  const lineData = {
    labels: data.monthBuckets.map((bucket) => bucket.label),
    datasets: lineRows.map((row, index) => ({
      label: row.label,
      data: row.values.map((item) => Number(((item.value || 0) * 100).toFixed(2))),
      borderColor: COLORS[index] || '#64748b',
      backgroundColor: 'rgba(85,219,232,0.08)',
      fill: false,
      tension: 0.35,
      pointRadius: 2,
    })),
  };

  return (
    <div className="space-y-4">
      <section className="lumi-dieu-hanh-panel rounded-lg border bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <SearchableFilterSelect
            label="B1 - Team"
            value={team}
            onChange={setTeam}
            options={data.teamOptions || []}
            allLabel="- Tất cả (All) -"
            placeholder="Tìm team..."
            className="w-[190px]"
          />
          <SearchableFilterSelect
            label="B2 - Cá nhân"
            value={person}
            onChange={setPerson}
            options={data.personOptions || []}
            allLabel="- Tất cả (All) -"
            placeholder="Tìm cá nhân..."
            className="w-[240px]"
          />
          <div className="ml-auto text-xs font-bold text-[#69768c]">
            {(team === 'all' ? departmentLabel(data.selectedDepartmentValue) : team)} · 4 kỳ gần nhất
          </div>
        </div>
      </section>

      <section className="lumi-dieu-hanh-panel rounded-lg border bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="lumi-section-title">BXH doanh số toàn team</h2>
          <div className="text-sm font-black text-[#2864d9]">
            TEAM {(team === 'all' ? departmentLabel(data.selectedDepartmentValue) : team).toUpperCase()}
          </div>
        </div>
        <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
          {rankingRows.map((row, index) => {
            const active = person === 'all' || person === row.label;
            const width = Math.max(6, Math.round((Number(row.rankValue || 0) / maxRank) * 100));
            return (
              <button
                type="button"
                key={row.label}
                onClick={() => setPerson(row.label)}
                className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition ${
                  active ? 'border-[#55dbe8] bg-[#f1fbff]' : 'border-slate-200 bg-white hover:border-[#55dbe8]'
                }`}
              >
                <div className="w-8 text-center text-sm font-black text-[#2864d9]">#{index + 1}</div>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2864d9] to-[#55dbe8] text-[11px] font-black text-white">
                  {row.label.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-xs font-black text-[#202534]">{row.label}</div>
                    {row.risk && <StatusBadge level="warn">CB</StatusBadge>}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#eef2f7]">
                      <div className="h-2 rounded-full bg-gradient-to-r from-[#2864d9] to-[#55dbe8]" style={{ width: `${width}%` }} />
                    </div>
                    <div className="w-24 text-right text-[11px] font-black text-[#2864d9]">{row.primary}</div>
                  </div>
                </div>
              </button>
            );
          })}
          {rankingRows.length === 0 && (
            <div className="rounded-lg border border-dashed border-[#cfdced] bg-[#f1fbff] p-6 text-center text-sm font-bold text-[#69768c]">
              Chưa có dữ liệu cá nhân trong phạm vi đang xem.
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {(selectedRow?.metrics || []).map((metric) => (
          <KpiCard
            key={metric.label}
            label={metric.label}
            display={metric.value}
            delta={metric.delta}
            status={metric.status}
            note={selectedRow.label}
          />
        ))}
      </div>

      <section className="lumi-dieu-hanh-panel rounded-lg border bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="lumi-section-title">Biểu đồ KPI cá nhân</h2>
          <span className="text-xs font-bold text-[#69768c]">{person === 'all' ? 'Top 5 nhân sự' : person}</span>
        </div>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className="h-[170px] rounded-lg border border-[#e2eaf4] bg-white p-2">
              <Line
                data={lineData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { position: 'top', labels: { boxWidth: 10, font: { size: 9 } } } },
                  scales: {
                    x: { grid: { color: 'rgba(207,220,237,0.55)' }, ticks: { font: { size: 9 } } },
                    y: { beginAtZero: true, grid: { color: 'rgba(207,220,237,0.55)' }, ticks: { font: { size: 9 }, callback: (v) => `${v}%` } },
                  },
                }}
              />
            </div>
          </div>
          {(selectedPeriod ? [selectedPeriod] : data.individualPeriodRows.slice(0, 3)).map((row) => (
            <MiniTrendChart
              key={row.label}
              title={`KPI chính - ${row.label}`}
              labels={row.values.map((value) => value.label)}
              values={row.values.map((value) => Number(((value.value || 0) * 100).toFixed(2)))}
              unit="%"
              danger={row.values.some((value) => value.risk)}
            />
          ))}
        </div>
      </section>

      <MetricTable title="Bảng số liệu cá nhân" aside="CS kỳ 1 -> 4, cảnh báo theo KPI team">
        <table className="lumi-compact-table min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Team</th>
              <th className="px-3 py-2">Cá nhân</th>
              <th className="px-3 py-2 text-right">Giá trị chính</th>
              <th className="px-3 py-2 text-right">KPI chính</th>
              <th className="px-3 py-2 text-right">{data.selectedDepartmentValue === 'delivery' ? 'Quá 24h' : 'KPI phụ'}</th>
              {data.monthBuckets.map((bucket) => (
                <th key={bucket.key} className="px-3 py-2 text-right">{bucket.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const period = data.individualPeriodRows.find((item) => item.label === row.label);
              return (
                <tr key={row.label} className={row.risk ? 'bg-red-50/70' : 'bg-white'}>
                  <td className="px-3 py-3 font-black text-[#2864d9]">{row.team}</td>
                  <td className="px-3 py-3 font-black text-[#202534]">{row.label}</td>
                  <td className="px-3 py-3 text-right font-bold">{row.primary}</td>
                  <td className={`px-3 py-3 text-right font-bold ${row.risk ? 'text-red-700' : 'text-[#2864d9]'}`}>{row.secondary}</td>
                  <td className="px-3 py-3 text-right font-bold text-[#69768c]">{row.third}</td>
                  {(period?.values || data.monthBuckets.map((bucket) => ({ label: bucket.label, display: '-', risk: false, delta: 0 }))).map((value) => (
                    <td key={value.label} className={`px-3 py-3 text-right ${value.risk ? 'bg-red-50 text-red-700' : 'text-[#202534]'}`}>
                      <div className="font-black">{value.display}</div>
                      <div className={`text-xs font-bold ${value.delta >= 0 ? 'text-[#2864d9]' : 'text-red-700'}`}>{formatPercent(value.delta)}</div>
                    </td>
                  ))}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm font-bold text-[#69768c]">
                  Chưa có dữ liệu cá nhân trong phạm vi đang xem.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </MetricTable>
    </div>
  );
}
