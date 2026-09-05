-- =============================================================================
-- kpi_sale: lưu KPI Sale tổng hợp theo ngày × nhân viên
-- Nguồn gốc tính: orders (+ users HR, detail_reports CPQC) — xem docs/LOGIC_KPI_SALE.md
-- Grain: 1 dòng = 1 nhân viên Sale / 1 ngày lên đơn
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.kpi_sale (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  report_date date NOT NULL,
  employee_name text NOT NULL,
  team text,
  department text NOT NULL DEFAULT 'Sale',
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
  -- Tỷ lệ thu = dthu_tc / ds_di (0 nếu ds_di = 0); lưu dạng tỉ lệ 0–1
  ty_le_thu numeric NOT NULL DEFAULT 0,

  -- CPQC từ detail_reports (ẩn trên embed KPIs Sale)
  cpqc numeric NOT NULL DEFAULT 0,

  source text NOT NULL DEFAULT 'orders',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_by text,

  CONSTRAINT kpi_sale_report_date_employee_unique UNIQUE (report_date, employee_name)
);

CREATE INDEX IF NOT EXISTS idx_kpi_sale_report_date
  ON public.kpi_sale (report_date);

CREATE INDEX IF NOT EXISTS idx_kpi_sale_employee_name
  ON public.kpi_sale (employee_name);

CREATE INDEX IF NOT EXISTS idx_kpi_sale_team
  ON public.kpi_sale (team);

CREATE INDEX IF NOT EXISTS idx_kpi_sale_department
  ON public.kpi_sale (department);

CREATE INDEX IF NOT EXISTS idx_kpi_sale_date_team
  ON public.kpi_sale (report_date, team);

CREATE OR REPLACE FUNCTION public.update_kpi_sale_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_kpi_sale_updated_at ON public.kpi_sale;
CREATE TRIGGER trigger_update_kpi_sale_updated_at
  BEFORE UPDATE ON public.kpi_sale
  FOR EACH ROW
  EXECUTE FUNCTION public.update_kpi_sale_updated_at();

ALTER TABLE public.kpi_sale ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to kpi_sale" ON public.kpi_sale;
CREATE POLICY "Allow all access to kpi_sale"
  ON public.kpi_sale
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_sale TO anon, authenticated;
