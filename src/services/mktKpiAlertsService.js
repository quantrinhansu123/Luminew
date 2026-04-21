import { supabase } from '../supabase/config';

const normText = (v) => String(v ?? '').trim();

function parseReportDateFromAlert(a) {
  const ms = Number(a?.reportDateMs);
  if (Number.isFinite(ms) && ms > 0) {
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const label = normText(a?.dateLabel);
  const m = label.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

export async function upsertMktKpiAlerts(alerts, { sourcePage = 'xem-bao-cao-mkt' } = {}) {
  console.log('[mktKpiAlertsService] 🔄 upsertMktKpiAlerts called with', alerts?.length, 'alerts');
  
  const list = Array.isArray(alerts) ? alerts : [];
  if (list.length === 0) {
    console.log('[mktKpiAlertsService] ⚠️ No alerts to upsert');
    return { upserted: 0 };
  }

  const nowIso = new Date().toISOString();

  const rows = list
    .map((a) => {
      const alertId = normText(a?.id);
      if (!alertId) return null;

      const employeeName = normText(a?.employeeName || a?.nhanSu);
      if (!employeeName) return null;

      const content = normText(a?.content || a?.noiDung);
      if (!content) return null;

      const reportDate = parseReportDateFromAlert(a);

      return {
        alert_id: alertId,
        source_page: normText(a?.page) || sourcePage,
        date_label: normText(a?.dateLabel) || null,
        report_date: reportDate,
        employee_name: employeeName,
        team: normText(a?.team) || null,
        severity: normText(a?.severity) || 'warning',
        content,
        cause: normText(a?.cause || a?.nguyenNhan) || null,
        alert_ts_ms: Number.isFinite(Number(a?.ts)) ? Number(a.ts) : null,
        last_seen_at: nowIso,
      };
    })
    .filter(Boolean);

  console.log('[mktKpiAlertsService] 📝 Prepared', rows.length, 'rows for upsert (filtered from', list.length, 'alerts)');

  if (rows.length === 0) {
    console.log('[mktKpiAlertsService] ⚠️ No valid rows after filtering');
    return { upserted: 0 };
  }

  // Upsert theo alert_id. first_seen_at giữ mặc định nếu insert; last_seen_at luôn cập nhật.
  const { error } = await supabase.from('mkt_kpi_alerts').upsert(rows, { onConflict: 'alert_id' });
  if (error) {
    console.error('[mktKpiAlertsService] ❌ Upsert error:', error);
    throw error;
  }

  console.log('[mktKpiAlertsService] ✅ Successfully upserted', rows.length, 'alerts to database');
  return { upserted: rows.length };
}

export async function submitMktKpiAlertExplanation({
  alertId,
  explanation,
  solution,
  byEmail,
  byName,
} = {}) {
  const id = normText(alertId);
  if (!id) throw new Error('Thiếu alertId');
  const exp = normText(explanation);
  const sol = normText(solution);
  if (!exp && !sol) throw new Error('Cần nhập giải trình hoặc giải pháp');

  const payload = {
    explanation: exp || null,
    solution: sol || null,
    explained_by_email: normText(byEmail) || null,
    explained_by_name: normText(byName) || null,
    explained_at: new Date().toISOString(),
    status: 'explained',
  };

  const { error } = await supabase.from('mkt_kpi_alerts').update(payload).eq('alert_id', id);
  if (error) throw error;
  return { ok: true };
}

export async function fetchMktKpiAlertsAdmin({
  fromDate,
  toDate,
  status,
  employeeQuery,
  limit = 500,
} = {}) {
  let q = supabase
    .from('mkt_kpi_alerts')
    .select('*')
    .order('last_seen_at', { ascending: false })
    .limit(limit);

  const fd = normText(fromDate);
  const td = normText(toDate);
  if (fd) q = q.gte('report_date', fd);
  if (td) q = q.lte('report_date', td);

  const st = normText(status);
  if (st && st !== 'all') q = q.eq('status', st);

  const emp = normText(employeeQuery);
  if (emp) q = q.ilike('employee_name', `%${emp}%`);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function adminUpdateMktKpiAlertStatus({
  alertId,
  status,
  adminNote,
  resolvedByEmail,
} = {}) {
  const id = normText(alertId);
  if (!id) throw new Error('Thiếu alertId');
  const st = normText(status);
  if (!st) throw new Error('Thiếu status');

  const payload = {
    status: st,
    admin_note: normText(adminNote) || null,
  };
  if (st === 'resolved') {
    payload.resolved_at = new Date().toISOString();
    payload.resolved_by_email = normText(resolvedByEmail) || null;
  }

  const { error } = await supabase.from('mkt_kpi_alerts').update(payload).eq('alert_id', id);
  if (error) throw error;
  return { ok: true };
}

