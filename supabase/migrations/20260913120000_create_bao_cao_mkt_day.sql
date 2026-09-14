-- =============================================================================
-- bao_cao_mkt_day: báo cáo MKT theo ngày
-- Cột: id, ngay, mkt, ca, thi_truong, sp, so_don, ds, so_don_huy, ds_huy,
--      so_don_ok, doanh_so_ok
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.bao_cao_mkt_day (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  ngay date NOT NULL,
  mkt text,
  ca text,
  thi_truong text,
  sp text,

  so_don integer NOT NULL DEFAULT 0,
  ds numeric NOT NULL DEFAULT 0,
  so_don_huy integer NOT NULL DEFAULT 0,
  ds_huy numeric NOT NULL DEFAULT 0,
  so_don_ok integer NOT NULL DEFAULT 0,
  doanh_so_ok numeric NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bao_cao_mkt_day_ngay_mkt_ca_sp_tt_unique
    UNIQUE (ngay, mkt, ca, sp, thi_truong)
);

CREATE INDEX IF NOT EXISTS idx_bao_cao_mkt_day_ngay
  ON public.bao_cao_mkt_day (ngay);

CREATE INDEX IF NOT EXISTS idx_bao_cao_mkt_day_mkt
  ON public.bao_cao_mkt_day (mkt);

CREATE INDEX IF NOT EXISTS idx_bao_cao_mkt_day_ca
  ON public.bao_cao_mkt_day (ca);

CREATE INDEX IF NOT EXISTS idx_bao_cao_mkt_day_thi_truong
  ON public.bao_cao_mkt_day (thi_truong);

CREATE INDEX IF NOT EXISTS idx_bao_cao_mkt_day_sp
  ON public.bao_cao_mkt_day (sp);

CREATE INDEX IF NOT EXISTS idx_bao_cao_mkt_day_ngay_mkt
  ON public.bao_cao_mkt_day (ngay, mkt);

CREATE OR REPLACE FUNCTION public.update_bao_cao_mkt_day_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_bao_cao_mkt_day_updated_at ON public.bao_cao_mkt_day;
CREATE TRIGGER trigger_update_bao_cao_mkt_day_updated_at
  BEFORE UPDATE ON public.bao_cao_mkt_day
  FOR EACH ROW
  EXECUTE FUNCTION public.update_bao_cao_mkt_day_updated_at();

ALTER TABLE public.bao_cao_mkt_day ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to bao_cao_mkt_day" ON public.bao_cao_mkt_day;
CREATE POLICY "Allow all access to bao_cao_mkt_day"
  ON public.bao_cao_mkt_day
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bao_cao_mkt_day TO anon, authenticated;

COMMENT ON TABLE public.bao_cao_mkt_day IS
  'Báo cáo MKT theo ngày: ngay, mkt, ca, thi_truong, sp, so_don, ds, so_don_huy, ds_huy, so_don_ok, doanh_so_ok.';
