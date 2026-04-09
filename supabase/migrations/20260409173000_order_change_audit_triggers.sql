-- Audit lịch sử thay đổi đơn hàng (bất biến) cho trang Vận đơn.
-- Theo dõi cả orders và order_code_hcm.

CREATE TABLE IF NOT EXISTS public.order_change_audit (
  id bigserial PRIMARY KEY,
  source_table text NOT NULL CHECK (source_table IN ('orders', 'order_code_hcm')),
  order_code text NOT NULL,
  op text NOT NULL CHECK (op IN ('INSERT', 'UPDATE', 'DELETE')),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by text NULL,
  changed_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_old jsonb NULL,
  row_new jsonb NULL
);

CREATE INDEX IF NOT EXISTS idx_order_change_audit_lookup
  ON public.order_change_audit (source_table, order_code, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_change_audit_changed_at
  ON public.order_change_audit (changed_at DESC);

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

  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(
      jsonb_object_agg(e.key, jsonb_build_object('old', NULL, 'new', e.value)),
      '{}'::jsonb
    )
    INTO v_fields
    FROM jsonb_each(to_jsonb(NEW)) AS e
    WHERE e.key <> 'updated_at';

    INSERT INTO public.order_change_audit (
      source_table, order_code, op, changed_by, changed_fields, row_old, row_new
    )
    VALUES (
      TG_TABLE_NAME, NEW.order_code, 'INSERT', v_changed_by, v_fields, NULL, to_jsonb(NEW)
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT COALESCE(
      jsonb_object_agg(e.key, jsonb_build_object('old', e.value, 'new', NULL)),
      '{}'::jsonb
    )
    INTO v_fields
    FROM jsonb_each(to_jsonb(OLD)) AS e
    WHERE e.key <> 'updated_at';

    INSERT INTO public.order_change_audit (
      source_table, order_code, op, changed_by, changed_fields, row_old, row_new
    )
    VALUES (
      TG_TABLE_NAME, OLD.order_code, 'DELETE', v_changed_by, v_fields, to_jsonb(OLD), NULL
    );
    RETURN OLD;
  END IF;

  -- UPDATE: chỉ lưu các cột đổi thực sự.
  FOR k IN
    SELECT key
    FROM (
      SELECT jsonb_object_keys(to_jsonb(OLD)) AS key
      UNION
      SELECT jsonb_object_keys(to_jsonb(NEW)) AS key
    ) AS keys
  LOOP
    IF k = 'updated_at' THEN
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
    TG_TABLE_NAME, NEW.order_code, 'UPDATE', v_changed_by, v_fields, to_jsonb(OLD), to_jsonb(NEW)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_change_audit ON public.orders;
CREATE TRIGGER trg_orders_change_audit
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.capture_order_change_audit();

DO $$
BEGIN
  IF to_regclass('public.order_code_hcm') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_order_code_hcm_change_audit ON public.order_code_hcm;
    CREATE TRIGGER trg_order_code_hcm_change_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.order_code_hcm
    FOR EACH ROW
    EXECUTE FUNCTION public.capture_order_change_audit();
  END IF;
END $$;

ALTER TABLE public.order_change_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_change_audit'
      AND policyname = 'order_change_audit_select_readonly'
  ) THEN
    CREATE POLICY order_change_audit_select_readonly
      ON public.order_change_audit
      FOR SELECT
      TO authenticated, anon
      USING (true);
  END IF;
END $$;

REVOKE INSERT, UPDATE, DELETE ON public.order_change_audit FROM authenticated, anon;
GRANT SELECT ON public.order_change_audit TO authenticated, anon;
