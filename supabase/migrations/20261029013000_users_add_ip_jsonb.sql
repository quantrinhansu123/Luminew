-- Cot ip (jsonb): thong tin phien dang nhap (ip, trinh duyet/HDH, nha mang, vi tri...).
-- Cot phone giu nguyen text cho so dien thoai.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ip jsonb;

COMMENT ON COLUMN public.users.ip IS
  'JSONB login session: ip, trinh_duyet_hdh, nha_mang, vi_tri, logged_at, ...';
