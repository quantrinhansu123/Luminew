import { Doughnut, Line } from 'react-chartjs-2';
import KpiCard from './KpiCard';
import MetricTable from './MetricTable';
import MiniTrendChart from './MiniTrendChart';
import StatusBadge from './StatusBadge';
import { formatMoney, formatNumber, formatPercent } from '../../../utils/dashboardDieuHanhMetrics';

function chartValue(metric, value) {
  if (metric.format === 'percent') return Number(((value || 0) * 100).toFixed(2));
  if (metric.format === 'money') return Number(((value || 0) / 1_000_000_000).toFixed(2));
  return Number(value || 0);
}

function chartUnit(metric) {
  if (metric.format === 'percent') return '%';
  if (metric.format === 'money') return ' tỷ';
  return '';
}

export default function CompanyTab({ data }) {
  const quickAlerts = data.alerts.filter((alert) => alert.type !== 'individual').slice(0, 4);
  const revenueLineData = {
    labels: data.monthly.map((m) => m.label),
    datasets: [
      {
        label: 'Doanh thu thực',
        data: data.monthly.map((m) => Number(((m.revenue || 0) / 1_000_000_000).toFixed(2))),
        borderColor: '#2864d9',
        backgroundColor: 'rgba(85, 219, 232, 0.18)',
        borderWidth: 2,
        fill: true,
        pointRadius: 3,
        tension: 0.4,
      },
      {
        label: 'Tiền đã thu',
        data: data.monthly.map((m) => Number(((m.collectedAmount || 0) / 1_000_000_000).toFixed(2))),
        borderColor: '#44c5b6',
        borderDash: [5, 4],
        borderWidth: 2,
        fill: false,
        pointRadius: 2,
        tension: 0.4,
      },
    ],
  };
  const deliveryRows = data.deliveryStatusRows || [];
  const deliveryDonutData = {
    labels: deliveryRows.map((row) => row.label),
    datasets: [
      {
        data: deliveryRows.map((row) => row.value),
        backgroundColor: deliveryRows.map((row) => row.color),
        borderColor: '#ffffff',
        borderWidth: 2,
      },
    ],
  };
  const productRows = data.productRows || [];
  const staffRows = data.individualRows.slice(0, 5);

  return (
    <div className="space-y-4">
      <section className="lumi-dieu-hanh-panel rounded-lg border bg-white p-3 shadow-sm">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="lumi-section-title">Chỉ số công ty - kỳ đang chọn</h2>
          <span className="text-xs font-bold text-[#69768c]">So với kỳ liền trước trong 4 tháng gần nhất</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {data.companyKpis.map((item) => (
            <KpiCard key={item.key} {...item} />
          ))}
        </div>
      </section>

      <section className="lumi-dieu-hanh-panel rounded-lg border bg-white p-3 shadow-sm">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="lumi-section-title">Xu hướng 8 chỉ số - 4 kỳ gần nhất</h2>
          <span className="text-xs font-bold text-[#69768c]">Đường ngưỡng hiển thị khi chỉ số có cảnh báo</span>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          {data.companyPeriodRows.map((metric) => (
            <MiniTrendChart
              key={metric.key}
              title={metric.label}
              labels={metric.values.map((v) => v.label)}
              values={metric.values.map((v) => chartValue(metric, v.value))}
              threshold={metric.threshold == null ? null : chartValue(metric, metric.threshold)}
              unit={chartUnit(metric)}
              danger={metric.values.some((v) => v.danger)}
            />
          ))}
        </div>
      </section>

      <MetricTable title="Bảng số liệu - 8 chỉ số trong 4 kỳ gần nhất" aside="Vượt ngưỡng được tô đỏ">
        <table className="lumi-compact-table min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Chỉ số</th>
              {data.monthly.map((m) => (
                <th key={m.key} className="px-3 py-2 text-right">{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.companyPeriodRows.map((row) => (
              <tr key={row.key}>
                <td className="px-3 py-3 font-bold text-slate-900">{row.label}</td>
                {row.values.map((v) => (
                  <td key={v.label} className={`px-3 py-3 text-right ${v.danger ? 'bg-red-50 text-red-700' : 'text-slate-900'}`}>
                    <div className="font-bold">{v.display}</div>
                    <div className={`text-xs font-semibold ${v.delta >= 0 ? 'text-[#2864d9]' : 'text-red-700'}`}>{formatPercent(v.delta)}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </MetricTable>

      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[1fr_260px]">
        <section className="lumi-dieu-hanh-panel rounded-lg border bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h2 className="lumi-section-title">Doanh thu theo thời gian</h2>
              <div className="text-xs font-bold text-[#69768c]">4 kỳ gần nhất theo khoảng ngày đang chọn</div>
            </div>
          </div>
          <div className="h-[150px]">
            <Line
              data={revenueLineData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { boxWidth: 10, usePointStyle: true, font: { size: 10 } } } },
                scales: {
                  x: { grid: { color: 'rgba(207,220,237,0.55)' }, ticks: { font: { size: 10 } } },
                  y: { beginAtZero: true, grid: { color: 'rgba(207,220,237,0.55)' }, ticks: { font: { size: 10 }, callback: (v) => `${v} tỷ` } },
                },
              }}
            />
          </div>
        </section>

        <section className="lumi-dieu-hanh-panel rounded-lg border bg-white p-3 shadow-sm">
          <h2 className="lumi-section-title">Tỷ lệ đặt hàng</h2>
          <div className="mt-2 h-[130px]">
            {deliveryRows.length > 0 ? (
              <Doughnut
                data={deliveryDonutData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: '62%',
                  plugins: { legend: { display: false } },
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg bg-[#f1fbff] text-xs font-bold text-[#69768c]">Chưa có vận đơn</div>
            )}
          </div>
          <div className="mt-2 space-y-1">
            {deliveryRows.slice(0, 5).map((row) => (
              <div key={row.key} className="flex items-center gap-2 text-[10px] font-bold text-[#202534]">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                <span>{formatNumber(row.value)}</span>
                <span className="w-9 text-right text-[#69768c]">{formatPercent(row.pct)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-2">
        <MetricTable title="Danh sách sản phẩm / mẫu bán tốt" aside="Chỉ hiện khi báo cáo MKT có cột sản phẩm thật">
          {productRows.length > 0 ? (
            <table className="lumi-compact-table min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Sản phẩm</th>
                  <th className="px-3 py-2">Thị trường</th>
                  <th className="px-3 py-2 text-right">Số đơn</th>
                  <th className="px-3 py-2 text-right">Doanh thu</th>
                  <th className="px-3 py-2 text-right">Ads/DT</th>
                  <th className="px-3 py-2 text-center">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productRows.map((row, index) => (
                  <tr key={row.product}>
                    <td className="px-3 py-2 font-bold text-[#2864d9]">{index + 1}</td>
                    <td className="px-3 py-2 font-black text-[#202534]">{row.product}</td>
                    <td className="px-3 py-2 font-semibold text-[#69768c]">{row.market || '-'}</td>
                    <td className="px-3 py-2 text-right font-bold">{formatNumber(row.orders)}</td>
                    <td className="px-3 py-2 text-right font-bold">{formatMoney(row.revenue)}</td>
                    <td className={`px-3 py-2 text-right font-bold ${row.adsRate > 0.35 ? 'text-red-700' : 'text-[#2864d9]'}`}>{formatPercent(row.adsRate)}</td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge level={row.adsRate > 0.35 ? 'warn' : 'ok'}>{row.adsRate > 0.35 ? 'Cảnh báo' : 'Tốt'}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="rounded-lg border border-dashed border-[#cfdced] bg-[#f1fbff] p-5 text-center text-sm font-bold text-[#69768c]">
              Chưa có cột sản phẩm trong dữ liệu MKT của phạm vi này.
            </div>
          )}
        </MetricTable>

        <section className="lumi-dieu-hanh-panel flex h-full flex-col rounded-lg border bg-white p-2.5 shadow-sm">
          <h2 className="lumi-section-title">Cảnh báo tự động</h2>
          <div className="lumi-alert-list mt-2 flex-1 space-y-1.5 pr-1">
            {quickAlerts.length > 0 ? (
              quickAlerts.map((alert) => (
                <div key={`${alert.title}-${alert.channel}`} className="lumi-alert-item rounded-lg border border-[#f6d48b] bg-white p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="truncate text-xs font-black text-[#202534]">{alert.title}</div>
                    <StatusBadge level={alert.level}>{alert.level === 'ok' ? 'OK' : alert.level === 'bad' ? 'Nguy' : 'Cảnh báo'}</StatusBadge>
                  </div>
                  <div className="lumi-alert-body mt-1 text-[11px] font-bold leading-4 text-[#202534]">{alert.body}</div>
                  <div className="mt-1 text-[10px] font-bold text-[#69768c]">{alert.channel}</div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm font-bold text-[#2864d9]">
                Chưa có cảnh báo vượt ngưỡng trong phạm vi đang xem.
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-3">
        <MetricTable title="Bảng dữ liệu theo chi nhánh" aside="Tách HN/HCM khi nguồn vận đơn cho phép">
          <table className="lumi-compact-table min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Chi nhánh</th>
                <th className="px-3 py-2 text-right">Doanh số</th>
                <th className="px-3 py-2 text-right">Doanh thu</th>
                <th className="px-3 py-2 text-right">Ads / DT</th>
                <th className="px-3 py-2 text-right">Chốt</th>
                <th className="px-3 py-2 text-right">Giao TC</th>
                <th className="px-3 py-2 text-right">Hủy + Hoàn</th>
                <th className="px-3 py-2 text-right">Thu tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.branchRows.map((row) => (
                <tr key={row.branch} className={row.risk ? 'bg-red-50/70' : 'bg-white'}>
                  <td className="px-3 py-3 font-bold text-slate-900">{row.label}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(row.orders)}</td>
                  <td className="px-3 py-3 text-right font-bold">{formatMoney(row.revenue)}</td>
                  <td className={`px-3 py-3 text-right font-bold ${row.adsRate > 0.35 ? 'text-red-700' : ''}`}>{formatPercent(row.adsRate)}</td>
                  <td className={`px-3 py-3 text-right font-bold ${row.closeRate < 0.08 ? 'text-red-700' : ''}`}>{formatPercent(row.closeRate)}</td>
                  <td className={`px-3 py-3 text-right font-bold ${row.deliverySuccessRate < 0.9 ? 'text-red-700' : ''}`}>{formatPercent(row.deliverySuccessRate)}</td>
                  <td className={`px-3 py-3 text-right font-bold ${row.cancelReturnRate > 0.08 ? 'text-red-700' : ''}`}>{formatPercent(row.cancelReturnRate)}</td>
                  <td className={`px-3 py-3 text-right font-bold ${row.collectionRate < 0.8 ? 'text-red-700' : ''}`}>{formatPercent(row.collectionRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </MetricTable>

        <MetricTable title="Hiệu suất nhân viên" aside="Theo team đang chọn">
          <table className="lumi-compact-table min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Nhân viên</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2 text-right">Giá trị</th>
                <th className="px-3 py-2 text-right">KPI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staffRows.map((row) => (
                <tr key={row.label}>
                  <td className="px-3 py-2 font-black text-[#202534]">{row.label}</td>
                  <td className="px-3 py-2 font-bold text-[#69768c]">{row.team}</td>
                  <td className="px-3 py-2 text-right font-bold">{row.primary}</td>
                  <td className={`px-3 py-2 text-right font-bold ${row.risk ? 'text-red-700' : 'text-[#2864d9]'}`}>{row.secondary}</td>
                </tr>
              ))}
              {staffRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center font-bold text-[#69768c]">Chưa có dữ liệu nhân viên.</td>
                </tr>
              )}
            </tbody>
          </table>
        </MetricTable>

        <section className="lumi-dieu-hanh-panel flex h-full flex-col rounded-lg border bg-white p-2.5 shadow-sm">
          <h2 className="lumi-section-title">Chỉ số nhanh - 8 KPI</h2>
          <div className="lumi-quick-list mt-1.5 grid flex-1 grid-cols-2 gap-x-3 gap-y-1 pr-1">
            {data.companyKpis.map((kpi) => (
              <div key={kpi.key} className="lumi-quick-item flex items-center justify-between gap-2 border-b border-[#e2eaf4] py-1.5">
                <div className="min-w-0">
                  <div className="truncate text-[10px] font-bold text-[#69768c]">{kpi.label}</div>
                  <div className={`text-xs font-black ${kpi.status === 'danger' ? 'text-red-700' : 'text-[#202534]'}`}>{kpi.display}</div>
                </div>
                <div className={`shrink-0 text-right text-[10px] font-black ${kpi.status === 'danger' ? 'text-red-700' : 'text-[#2864d9]'}`}>
                  {kpi.status === 'danger' ? 'Vượt ngưỡng' : 'OK'}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
