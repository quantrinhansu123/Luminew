/**
 * Ghi supabase-config.js từ .env cho iframe báo cáo vận đơn NV (static HTML).
 */
import fs from 'fs';
import path from 'path';

const OUT = path.resolve('public/baocao-vandon-nv/supabase-config.js');

export function writeBaocaoVandonSupabaseConfig(env = {}) {
  const url = String(env.VITE_SUPABASE_URL || '').trim();
  const key = String(env.VITE_SUPABASE_ANON_KEY || '').trim();
  const lines = ['/* Auto-generated — không sửa tay; từ VITE_SUPABASE_* trong .env */'];
  if (url) lines.push(`window.__SUPABASE_URL__=${JSON.stringify(url)};`);
  if (key) lines.push(`window.__SUPABASE_ANON_KEY__=${JSON.stringify(key)};`);
  fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
}

export function viteBaocaoVandonNvSupabaseConfigPlugin(env = {}) {
  return {
    name: 'vite-baocao-vandon-supabase-config',
    buildStart() {
      writeBaocaoVandonSupabaseConfig(env);
    },
    configureServer() {
      writeBaocaoVandonSupabaseConfig(env);
    },
  };
}
