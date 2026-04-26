import { mapOrderDbRowToLegacyF3, mapUserRowToLegacyNhanSu } from './mapOrderDbRowToLegacyF3.js';

const PAGE = 800;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ startDate?: string, endDate?: string, maxRows?: number }} opts
 */
export async function fetchF3LegacyMapped(supabase, opts = {}) {
  const { startDate = '', endDate = '', maxRows } = opts;
  const cap = Math.min(Number(maxRows) || 80000, 150000);
  const rows = [];
  let from = 0;

  while (rows.length < cap) {
    let q = supabase.from('orders').select('*');
    if (startDate) q = q.gte('order_date', startDate);
    if (endDate) q = q.lte('order_date', endDate);
    q = q
      .order('order_date', { ascending: false, nullsFirst: false })
      .order('order_code', { ascending: false })
      .range(from, from + PAGE - 1);

    const { data, error } = await q;
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }

  return rows.slice(0, cap).map(mapOrderDbRowToLegacyF3);
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
export async function fetchHrLegacyMapped(supabase) {
  const { data, error } = await supabase
    .from('users')
    .select('id,name,user_name,username,team,branch,position');
  if (error) throw error;
  const list = (data || []).map(mapUserRowToLegacyNhanSu).filter(Boolean);
  return list.filter((r) => r.Team);
}

/** @param {NodeJS.ProcessEnv} [env] */
export async function proxyMktReport(env = process.env) {
  const base =
    env.MKT_REPORT_API_BASE || 'https://n-api-gamma.vercel.app/report/generate';
  const url = `${base}?tableName=${encodeURIComponent('Báo cáo MKT')}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25000);
  try {
    const r = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`MKT proxy ${r.status}: ${text.slice(0, 200)}`);
    }
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}
