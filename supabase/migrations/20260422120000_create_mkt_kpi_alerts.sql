-- Lưu cảnh báo KPI MKT + giải trình nhân sự.
-- Nguồn cảnh báo: iframe viewNsMoiNhanh*.html (xem-bao-cao-mkt) → host React → upsert.

CREATE TABLE IF NOT EXISTS public.mkt_kpi_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dedupe key (đồng bộ từ client): ví dụ `${dateLabel}\0${employeeName}\0${metric}\0${severity}`
  alert_id text NOT NULL UNIQUE,

  source_page text NOT NULL DEFAULT 'xem-bao-cao-mkt',
  date_label text,
  report_date date,

  employee_name text NOT NULL,
  team text,
  severity text NOT NULL DEFAULT 'warning', -- info|warning|critical
  content text NOT NULL,
  cause text,

  -- Thời điểm alert được tạo ở client (ms epoch) + seen timestamps server-side
  alert_ts_ms bigint,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),

  -- Giải trình của nhân sự
  explanation text,
  solution text,
  explained_by_email text,
  explained_by_name text,
  explained_at timestamptz,

  -- Quản trị
  status text NOT NULL DEFAULT 'open', -- open|explained|resolved|ignored
  admin_note text,
  resolved_by_email text,
  resolved_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mkt_kpi_alerts_employee_name
  ON public.mkt_kpi_alerts (employee_name);
CREATE INDEX IF NOT EXISTS idx_mkt_kpi_alerts_report_date
  ON public.mkt_kpi_alerts (report_date);
CREATE INDEX IF NOT EXISTS idx_mkt_kpi_alerts_status
  ON public.mkt_kpi_alerts (status);
CREATE INDEX IF NOT EXISTS idx_mkt_kpi_alerts_last_seen_at
  ON public.mkt_kpi_alerts (last_seen_at DESC);

CREATE OR REPLACE FUNCTION public.update_mkt_kpi_alerts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_mkt_kpi_alerts_updated_at ON public.mkt_kpi_alerts;
CREATE TRIGGER trigger_update_mkt_kpi_alerts_updated_at
  BEFORE UPDATE ON public.mkt_kpi_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_mkt_kpi_alerts_updated_at();

ALTER TABLE public.mkt_kpi_alerts ENABLE ROW LEVEL SECURITY;

-- Theo convention RBAC hiện tại: cho anon/authenticated thao tác (app đang dùng anon key).
DROP POLICY IF EXISTS "Allow all access to mkt_kpi_alerts" ON public.mkt_kpi_alerts;
CREATE POLICY "Allow all access to mkt_kpi_alerts"
  ON public.mkt_kpi_alerts
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_kpi_alerts TO anon, authenticated;

