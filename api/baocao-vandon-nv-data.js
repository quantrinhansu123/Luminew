// Dữ liệu cho static reports public/baocao-vandon-nv — lấy từ Supabase (orders, users).
// GET /api/baocao-vandon-nv-data?kind=f3|hr|mkt
//
// Biến môi trường Vercel (khuyến nghị):
//   SUPABASE_URL hoặc VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY (ưu tiên) hoặc SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY
//
// kind=mkt: proxy Báo cáo MKT (mặc định n-api-gamma; ghi đè bằng MKT_REPORT_API_BASE).

import { createClient } from '@supabase/supabase-js';
import {
  fetchF3LegacyMapped,
  fetchHrLegacyMapped,
  proxyMktReport,
} from './lib/baocaoVandonNvCore.js';

function cors(res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-Requested-With, Accept, Content-Type'
  );
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
      const body = await proxyMktReport();
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
      res.status(200).json(body);
      return;
    }

    const client = getSupabase();

    if (kind === 'hr' || kind === 'nhan-su' || kind === 'nhansu') {
      const hr = await fetchHrLegacyMapped(client);
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=240');
      res.status(200).json(hr);
      return;
    }

    const startDate = req.query.start_date ? String(req.query.start_date).trim() : '';
    const endDate = req.query.end_date ? String(req.query.end_date).trim() : '';
    const maxRows = req.query.max_rows ? Number(req.query.max_rows) : undefined;

    const mapped = await fetchF3LegacyMapped(client, { startDate, endDate, maxRows });
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    res.status(200).json(mapped);
  } catch (e) {
    console.error('[baocao-vandon-nv-data]', kind, e);
    res.status(500).json({
      error: e.message || 'Server error',
      kind,
    });
  }
}
