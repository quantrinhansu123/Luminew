-- Thu gọn audit vận đơn: chỉ ghi các cột quan trọng và chỉ khi UPDATE các cột đó.
-- Cột theo dõi:
-- - check_result          (Kết quả Check)
-- - delivery_status_nb    (Trạng thái giao hàng NB)
-- - tracking_code         (Mã Tracking)
-- - payment_status        (Trạng thái thu tiền)

CREATE OR REPLACE FUNCTION public.capture_order_change_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed_by text;
  v_fields jsonb := '{}'::jsonb;
  oldv jsonb;
  newv jsonb;
  tracked_key text;
  tracked_keys constant text[] := ARRAY[
    'check_result',
    'delivery_status_nb',
    'tracking_code',
    'payment_status'
  ];
BEGIN
  -- Chỉ ghi khi UPDATE; INSERT/DELETE bỏ qua để tránh log nhiễu.
  IF TG_OP <> 'UPDATE' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

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

  FOREACH tracked_key IN ARRAY tracked_keys LOOP
    oldv := to_jsonb(OLD) -> tracked_key;
    newv := to_jsonb(NEW) -> tracked_key;
    IF oldv IS DISTINCT FROM newv THEN
      v_fields := v_fields || jsonb_build_object(
        tracked_key,
        jsonb_build_object('old', oldv, 'new', newv)
      );
    END IF;
  END LOOP;

  IF v_fields = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.order_change_audit (
    source_table, order_code, op, changed_by, changed_fields, row_old, row_new
  )
  VALUES (
    TG_TABLE_NAME,
    NEW.order_code,
    'UPDATE',
    v_changed_by,
    v_fields,
    NULL,
    NULL
  );

  RETURN NEW;
END;
$$;

