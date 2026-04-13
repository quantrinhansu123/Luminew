-- Thêm cột ngày thay đổi cho orders + order_code_hcm.
-- Quy tắc: khi bất kỳ cột dữ liệu nào của dòng đơn thay đổi, `ngay_thay_doi` = CURRENT_DATE.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ngay_thay_doi date;

DO $$
BEGIN
  IF to_regclass('public.order_code_hcm') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.order_code_hcm ADD COLUMN IF NOT EXISTS ngay_thay_doi date';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_ngay_thay_doi_current_date()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Chỉ cập nhật ngày khi có thay đổi thực sự ngoài chính cột ngay_thay_doi.
  IF (to_jsonb(NEW) - 'ngay_thay_doi') IS DISTINCT FROM (to_jsonb(OLD) - 'ngay_thay_doi') THEN
    NEW.ngay_thay_doi := CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_set_ngay_thay_doi ON public.orders;
CREATE TRIGGER trg_orders_set_ngay_thay_doi
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.set_ngay_thay_doi_current_date();

DO $$
BEGIN
  IF to_regclass('public.order_code_hcm') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_order_code_hcm_set_ngay_thay_doi ON public.order_code_hcm';
    EXECUTE '
      CREATE TRIGGER trg_order_code_hcm_set_ngay_thay_doi
      BEFORE UPDATE ON public.order_code_hcm
      FOR EACH ROW
      EXECUTE FUNCTION public.set_ngay_thay_doi_current_date()
    ';
  END IF;
END $$;

