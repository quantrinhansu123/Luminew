import { AlertTriangle, CheckCircle2, TrendingDown, TrendingUp } from 'lucide-react';
import { formatPercent } from '../../../utils/dashboardDieuHanhMetrics';

export default function KpiCard({ label, value, display, delta = 0, status = 'good', note }) {
  const danger = status === 'danger' || status === 'bad';
  const deltaUp = Number(delta || 0) >= 0;
  const warn = status === 'warn';
  const tone = danger
    ? 'border-red-200 bg-red-50 text-red-700'
    : status === 'warn'
      ? 'border-orange-200 bg-orange-50 text-orange-700'
      : 'border-cyan-200 bg-cyan-50 text-[#2864d9]';
  const cardTone = danger
    ? 'border-red-200 bg-red-50'
    : warn
      ? 'border-orange-200 bg-orange-50'
      : 'border-blue-100 bg-white';

  return (
    <div className={`lumi-kpi-card relative overflow-hidden rounded-lg border p-3 transition hover:-translate-y-0.5 hover:shadow-md ${cardTone}`}>
      <div className={`absolute -right-7 -top-7 h-24 w-24 rounded-full opacity-20 ${danger ? 'bg-red-300' : warn ? 'bg-orange-300' : 'bg-cyan-300'}`} />
      {!danger && !warn && <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#2864d9] via-[#55dbe8] to-[#44c5b6]" />}
      {warn && <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#ffd447] to-[#ff8a1f]" />}
      <div className="relative flex items-start justify-between gap-3">
        <div className={`inline-flex h-8 w-8 items-center justify-center rounded-md border ${tone}`}>
          {danger ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        </div>
        <div className={`inline-flex items-center gap-1 rounded-full border border-slate-100 bg-white px-2 py-0.5 text-[11px] font-black shadow-sm ${deltaUp ? 'text-[#2864d9]' : 'text-red-700'}`}>
          {deltaUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {formatPercent(Math.abs(delta))}
        </div>
      </div>
      <div className="relative mt-3 text-[9px] font-black uppercase tracking-wide text-[#69768c]">{label}</div>
      <div className={`relative mt-1 text-2xl font-black leading-none tracking-normal ${danger ? 'text-red-700' : warn ? 'text-orange-700' : 'text-[#202534]'}`}>
        {display ?? value}
      </div>
      <div className="relative mt-2 border-t border-[#e2eaf4] pt-2 text-[10px] font-bold text-[#69768c]">{note}</div>
    </div>
  );
}
