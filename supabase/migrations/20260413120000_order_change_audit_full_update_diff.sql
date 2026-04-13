-- Khách phản hồi: lịch sử «Lịch sử thay đổi» trên Vận đơn bị thiếu.
-- Migration 20260409190000 chỉ audit 4 cột (check_result, delivery_status_nb, tracking_code, payment_status)
-- → mọi sửa khác (ghi chú, lý do, NV vận đơn, tiền, v.v.) không có trong order_change_audit.
--
-- Khôi phục: trên UPDATE ghi mọi cột thay đổi, trừ:
--   - updated_at (nhiễu)
--   - log (jsonb được merge mỗi lần lưu lưới — trùng nội dung Nhật ký trong DB, diff quá lớn)
-- INSERT/DELETE: không ghi (giữ hành vi gọn như bản focus).

CREATE OR REPLACE FUNCTION public.capture_order_change_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed_by text;
  v_fields jsonb := '{}'::jsonb;
  k text;
  oldv jsonb;
  newv jsonb;
BEGIN
  v_changed_by := NULLIF(
    COALESCE(
      NEW.last_modified_by,
      OLD.last_modified_by,
      current_setting('request.jwt.claim.email', true),
      current_setting('request.jwt.claim.sub', true),
      current_user
    ),
    ''
  );

  IF TG_OP <> 'UPDATE' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  FOR k IN
    SELECT x.key
    FROM (
      SELECT jsonb_object_keys(to_jsonb(OLD)) AS key
      UNION
      SELECT jsonb_object_keys(to_jsonb(NEW)) AS key
    ) AS x
  LOOP
    IF k IN ('updated_at', 'log') THEN
      CONTINUE;
    END IF;
    oldv := to_jsonb(OLD) -> k;
    newv := to_jsonb(NEW) -> k;
    IF oldv IS DISTINCT FROM newv THEN
      v_fields := v_fields || jsonb_build_object(k, jsonb_build_object('old', oldv, 'new', newv));
    END IF;
  END LOOP;

  IF v_fields = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.order_change_audit (
    source_table, order_code, op, changed_by, changed_fields, row_old, row_new
  )
  VALUES (
    TG_TABLE_NAME, NEW.order_code, 'UPDATE', v_changed_by, v_fields, NULL, NULL
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.capture_order_change_audit() IS
  'Audit đơn (orders / order_code_hcm): mỗi UPDATE ghi mọi cột đổi vào order_change_audit, trừ updated_at và log.';
