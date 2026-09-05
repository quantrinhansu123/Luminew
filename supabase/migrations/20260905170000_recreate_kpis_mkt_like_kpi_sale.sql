-- =============================================================================
-- kpis_mkt: đồng bộ schema với kpi_sale (chốt từ orders theo NV MKT / ngày)
-- Bảng trước đó (so_mess, so_don_ok, …) chưa có data — recreate cho khớp code Chốt.
-- =============================================================================

DROP TABLE IF EXISTS public.kpis_mkt;

CREATE TABLE public.kpis_mkt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  report_date date NOT NULL,
  employee_name text NOT NULL,
  team text,
  department text NOT NULL DEFAULT 'MKT',
  branch text,

  -- Chốt
  don_chot integer NOT NULL DEFAULT 0,
  ds_chot numeric NOT NULL DEFAULT 0,

  -- Hủy
  don_huy integer NOT NULL DEFAULT 0,
  ds_huy numeric NOT NULL DEFAULT 0,

  -- Sau hủy
  don_sau_huy integer NOT NULL DEFAULT 0,
  ds_sau_huy numeric NOT NULL DEFAULT 0,

  -- Đi
  don_di integer NOT NULL DEFAULT 0,
  ds_di numeric NOT NULL DEFAULT 0,

  -- Thu tiền
  don_thu_tien integer NOT NULL DEFAULT 0,
  dthu_tc numeric NOT NULL DEFAULT 0,

  -- Ship / KPI
  ship numeric NOT NULL DEFAULT 0,
  dthu_kpi numeric NOT NULL DEFAULT 0,
  ty_le_thu numeric NOT NULL DEFAULT 0,

  cpqc numeric NOT NULL DEFAULT 0,

  source text NOT NULL DEFAULT 'orders',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_by text,

  CONSTRAINT kpis_mkt_report_date_employee_unique UNIQUE (report_date, employee_name)
);

CREATE INDEX IF NOT EXISTS idx_kpis_mkt_report_date
  ON public.kpis_mkt (report_date);

CREATE INDEX IF NOT EXISTS idx_kpis_mkt_employee_name
  ON public.kpis_mkt (employee_name);

CREATE INDEX IF NOT EXISTS idx_kpis_mkt_team
  ON public.kpis_mkt (team);

CREATE INDEX IF NOT EXISTS idx_kpis_mkt_department
  ON public.kpis_mkt (department);

CREATE INDEX IF NOT EXISTS idx_kpis_mkt_date_team
  ON public.kpis_mkt (report_date, team);

CREATE OR REPLACE FUNCTION public.update_kpis_mkt_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_kpis_mkt_updated_at ON public.kpis_mkt;
CREATE TRIGGER trigger_update_kpis_mkt_updated_at
  BEFORE UPDATE ON public.kpis_mkt
  FOR EACH ROW
  EXECUTE FUNCTION public.update_kpis_mkt_updated_at();

ALTER TABLE public.kpis_mkt ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to kpis_mkt" ON public.kpis_mkt;
CREATE POLICY "Allow all access to kpis_mkt"
  ON public.kpis_mkt
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpis_mkt TO anon, authenticated;
