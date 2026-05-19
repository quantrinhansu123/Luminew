import MetricTable from './MetricTable';
import StatusBadge from './StatusBadge';

function levelText(level) {
  if (level === 'bad' || level === 'danger') return 'Nguy';
  if (level === 'warn') return 'Cảnh báo';
  return 'OK';
}

export default function AlertsTab({ data }) {
  const bad = data.alerts.filter((alert) => alert.level === 'bad' || alert.level === 'danger').length;
  const warn = data.alerts.filter((alert) => alert.level === 'warn').length;
  const ok = data.companyKpis.filter((kpi) => kpi.status !== 'danger').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
          <div className="text-3xl font-black text-red-700">{bad}</div>
          <div className="mt-1 text-xs font-black uppercase tracking-wide text-red-700">Vượt ngưỡng đỏ</div>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-center">
          <div className="text-3xl font-black text-orange-700">{warn}</div>
          <div className="mt-1 text-xs font-black uppercase tracking-wide text-orange-700">Cảnh báo cam</div>
        </div>
        <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4 text-center">
          <div className="text-3xl font-black text-[#2864d9]">{ok}</div>
          <div className="mt-1 text-xs font-black uppercase tracking-wide text-[#2864d9]">Chỉ số ổn định</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
          <div className="text-3xl font-black text-slate-900">{data.companyKpis.length}</div>
          <div className="mt-1 text-xs font-black uppercase tracking-wide text-slate-500">KPI công ty</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="lumi-dieu-hanh-panel rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="lumi-section-title">Cảnh báo công ty & bộ phận</h2>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-cyan-50 p-3">
              <div className="text-[11px] font-black uppercase tracking-wide text-[#2864d9]">Đối tượng nhận</div>
              <div className="mt-1 text-sm font-bold text-[#202534]">Ban Giám đốc, Team Leader</div>
            </div>
            <div className="rounded-lg bg-cyan-50 p-3">
              <div className="text-[11px] font-black uppercase tracking-wide text-[#2864d9]">Kênh & tần suất</div>
              <div className="mt-1 text-sm font-bold text-[#202534]">Zalo, hằng ngày 08:00</div>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {data.alerts.filter((alert) => alert.type !== 'individual').map((alert) => (
              <div key={`${alert.title}-${alert.body}`} className="rounded-lg border border-[#e2eaf4] bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-black text-[#202534]">{alert.title}</div>
                  <StatusBadge level={alert.level}>{levelText(alert.level)}</StatusBadge>
                </div>
                <div className="mt-1 text-xs font-bold leading-5 text-[#202534]">{alert.body}</div>
                <div className="mt-2 text-[11px] font-bold text-[#69768c]">{alert.target} · {alert.channel}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="lumi-dieu-hanh-panel rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="lumi-section-title">Cảnh báo cá nhân & team</h2>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-cyan-50 p-3">
              <div className="text-[11px] font-black uppercase tracking-wide text-[#2864d9]">Lịch KPI cá nhân</div>
              <div className="mt-1 text-sm font-bold text-[#202534]">Thứ Hai & Thứ Năm 08:00</div>
            </div>
            <div className="rounded-lg bg-orange-50 p-3">
              <div className="text-[11px] font-black uppercase tracking-wide text-orange-700">Vận đơn quá 24h</div>
              <div className="mt-1 text-sm font-bold text-orange-900">Cảnh báo hằng ngày 08:00</div>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {data.alerts.filter((alert) => alert.type === 'individual').length > 0 ? (
              data.alerts.filter((alert) => alert.type === 'individual').map((alert) => (
                <div key={`${alert.title}-${alert.body}`} className="rounded-lg border border-[#e2eaf4] bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-black text-[#202534]">{alert.title}</div>
                    <StatusBadge level={alert.level}>{levelText(alert.level)}</StatusBadge>
                  </div>
                  <div className="mt-1 text-xs font-bold leading-5 text-[#202534]">{alert.body}</div>
                  <div className="mt-2 text-[11px] font-bold text-[#69768c]">{alert.target} · {alert.channel}</div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm font-bold text-[#2864d9]">
                Chưa có cảnh báo cá nhân trong phạm vi đang xem.
              </div>
            )}
          </div>
        </section>
      </div>

      <MetricTable title="Bảng ngưỡng cảnh báo tất cả chỉ số" aside="Sinh từ KPI thật hiện tại">
        <table className="lumi-compact-table min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Chỉ số</th>
              <th className="px-3 py-2">Đối tượng</th>
              <th className="px-3 py-2 text-center">Ngưỡng</th>
              <th className="px-3 py-2 text-center">Hiện tại</th>
              <th className="px-3 py-2 text-center">Trạng thái</th>
              <th className="px-3 py-2">Kênh</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.companyKpis.filter((kpi) => kpi.threshold != null).map((kpi) => (
              <tr key={kpi.key} className={kpi.status === 'danger' ? 'bg-red-50/70' : 'bg-white'}>
                <td className="px-3 py-3 font-bold text-slate-900">{kpi.label}</td>
                <td className="px-3 py-3 font-semibold text-slate-600">Công ty / Bộ phận liên quan</td>
                <td className="px-3 py-3 text-center font-bold">{kpi.direction === 'max' ? '>' : '<'} {(kpi.threshold * 100).toFixed(0)}%</td>
                <td className={`px-3 py-3 text-center font-black ${kpi.status === 'danger' ? 'text-red-700' : 'text-slate-900'}`}>{kpi.display}</td>
                <td className="px-3 py-3 text-center"><StatusBadge level={kpi.status === 'danger' ? 'bad' : 'ok'}>{kpi.status === 'danger' ? 'Vượt' : 'OK'}</StatusBadge></td>
                <td className="px-3 py-3 font-semibold text-slate-600">Zalo hằng ngày 08:00</td>
              </tr>
            ))}
          </tbody>
        </table>
      </MetricTable>
    </div>
  );
}
