import { createClient } from '@supabase/supabase-js';
import {
  resolveFetchDateRange,
  resolveBaocaoOrderHcmTable,
  fetchF3LegacyMapped,
  fetchHrForKpiOrEmpty,
  fetchVanDonHcmDeliveryStaffDirectory,
  fetchMktFromDetailReports,
  ORDER_HCM_SUPABASE_TABLE,
  BAOCAO_VANDON_NV_ORDERS_TABLE,
  mapOrderDbRowToLegacyF3,
  mapOrderDbRowToLegacyF3Baocao,
  mapUserRowToLegacyNhanSu,
  DEFAULT_BAOCAO_MAX_ROWS,
} from '../public/baocao-vandon-nv/baocaoVandonNvCore.mjs';

export {
  resolveFetchDateRange,
  resolveBaocaoOrderHcmTable,
  fetchF3LegacyMapped,
  fetchHrForKpiOrEmpty,
  fetchVanDonHcmDeliveryStaffDirectory,
  fetchMktFromDetailReports,
  ORDER_HCM_SUPABASE_TABLE,
  BAOCAO_VANDON_NV_ORDERS_TABLE,
  mapOrderDbRowToLegacyF3,
  mapOrderDbRowToLegacyF3Baocao,
  mapUserRowToLegacyNhanSu,
  DEFAULT_BAOCAO_MAX_ROWS,
};

/** @deprecated Báo cáo vận đơn NV dùng Supabase trực tiếp trên client; API giữ cho tương thích. */
async function fetchMktReportUpstream(env = process.env) {
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
    const text = await r.text();
    if (!r.ok) {
      return {
        ok: false,
        reason: 'http',
        status: r.status,
        snippet: text.slice(0, 220),
      };
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, reason: 'parse', snippet: text.slice(0, 120) };
    }
    if (json && json.success === false) {
      return {
        ok: false,
        reason: 'report',
        snippet: String(json.message || '').slice(0, 200),
      };
    }
    return { ok: true, json };
  } catch (e) {
    const msg = e && e.message ? String(e.message).split('\n')[0].slice(0, 160) : 'unknown';
    return { ok: false, reason: 'network', snippet: msg };
  } finally {
    clearTimeout(t);
  }
}

export async function proxyMktReport(env = process.env) {
  const r = await fetchMktReportUpstream(env);
  if (!r.ok) {
    const detail =
      r.reason === 'http'
        ? `MKT proxy ${r.status}: ${r.snippet}`
        : `MKT ${r.reason}: ${r.snippet}`;
    throw new Error(detail);
  }
  return r.json;
}

export async function fetchMktForKpiOrEmpty(env = process.env, supabaseClient = null) {
  const r = await fetchMktReportUpstream(env);
  if (r.ok) return r.json;
  console.warn('[baocaoVandonNvData] MKT n-api unavailable:', r.reason, (r.snippet || '').slice(0, 120));
  if (supabaseClient) {
    try {
      const fallbackRows = await fetchMktFromDetailReports(supabaseClient);
      if (fallbackRows.length) {
        return { data: fallbackRows, rows: fallbackRows };
      }
    } catch (e) {
      console.warn('[baocaoVandonNvData] detail_reports MKT fallback failed:', e && e.message);
    }
  }
  return { data: [], rows: [] };
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Thiếu SUPABASE_URL/VITE_SUPABASE_URL hoặc key Supabase trên server');
  }
  return createClient(url, key);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-Requested-With, Accept, Content-Type'
  );
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const kind = (req.query.kind || 'f3').toString().toLowerCase();

  try {
    if (kind === 'mkt') {
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
      let sb = null;
      try {
        sb = getSupabase();
      } catch (_) {
        /* chỉ n-api */
      }
      try {
        const body = await fetchMktForKpiOrEmpty(process.env, sb);
        res.status(200).json(body && typeof body === 'object' ? body : { data: [], rows: [] });
      } catch (e) {
        console.warn('[baocaoVandonNvData] kind=mkt handler fallback:', e && e.message);
        res.status(200).json({ data: [], rows: [] });
      }
      return;
    }

    const client = getSupabase();

    if (kind === 'hr' || kind === 'nhan-su' || kind === 'nhansu') {
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=240');
      try {
        const hr = await fetchHrForKpiOrEmpty(client);
        res.status(200).json(Array.isArray(hr) ? hr : []);
      } catch (e) {
        console.warn('[baocaoVandonNvData] kind=hr handler fallback:', e && e.message);
        res.status(200).json([]);
      }
      return;
    }

    if (kind === 'vandon-staff' || kind === 'delivery-staff' || kind === 'nv-van-don') {
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      const names = await fetchVanDonHcmDeliveryStaffDirectory(client);
      res.status(200).json(names);
      return;
    }

    const range = resolveFetchDateRange(req.query.start_date, req.query.end_date);
    const maxRows = req.query.max_rows ? Number(req.query.max_rows) : undefined;
    const tableName = resolveBaocaoOrderHcmTable(req.query.table || req.query.source_table);

    const mapped = await fetchF3LegacyMapped(client, {
      startDate: range.startDate,
      endDate: range.endDate,
      maxRows,
      tableName,
    });
    res.setHeader('X-Baocao-Vandon-Source-Table', tableName);
    res.setHeader('X-Order-Hcm-Alias', 'order_hcm');
    res.setHeader('X-Baocao-Date-Start', range.startDate);
    res.setHeader('X-Baocao-Date-End', range.endDate);
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    res.status(200).json({ rows: mapped, count: mapped.length });
  } catch (e) {
    const msg = e && e.message ? String(e.message) : 'Server error';
    console.error('[baocaoVandonNvData]', kind, msg);
    res.status(500).json({ error: msg, kind });
  }
}
