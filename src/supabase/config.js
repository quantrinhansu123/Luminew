import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const fallbackUrl = 'https://gsjhsmxyxjyiqovauyrp.supabase.co';
const fallbackKey = 'sb_publishable_vXBSa3eP8cvjIK2qLWI6Ug_FoYm4CNy';

const finalUrl = supabaseUrl || fallbackUrl;
const finalKey = supabaseAnonKey || fallbackKey;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong .env — dùng cấu hình fallback (dev).'
  );
}

export const supabase = createClient(finalUrl, finalKey);

export default supabase;
