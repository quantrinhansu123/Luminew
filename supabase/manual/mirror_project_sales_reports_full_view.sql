-- Chạy trên project Supabase PHỤ (SQL Editor), ví dụ: vaalbqylflhfgcgmxrmp.supabase.co
-- UI app (admin): đường dẫn /sales-reports-supabase-mirror — cấu hình .env VITE_SUPABASE_SALES_MIRROR_*.
-- View = đủ cột như public.sales_reports — app: .from('sales_reports_full')
--   khi .env có VITE_SUPABASE_SALES_MIRROR_FROM=sales_reports_full
--   hoặc NEXT_PUBLIC_SUPABASE_SALES_MIRROR_FROM=sales_reports_full
-- Bật RLS + policy SELECT cho anon (hoặc grant phù hợp) nếu client dùng anon key.
--
-- .env (Vite): VITE_SUPABASE_SALES_MIRROR_URL + VITE_SUPABASE_SALES_MIRROR_ANON_KEY = JWT eyJ...
-- JWT Secret (base64) trong Dashboard chỉ dùng server/script: SUPABASE_SALES_MIRROR_JWT_SECRET (không VITE_).

CREATE OR REPLACE VIEW public.sales_reports_full AS
SELECT *
FROM public.sales_reports;

COMMENT ON VIEW public.sales_reports_full IS
    'Bản sao logic đầy đủ cột sales_reports — dùng cho app đọc qua Supabase client phụ.';
