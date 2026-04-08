-- Chuẩn hóa public.users.selected_personnel (jsonb array of text):
-- Một phần tử kiểu "An, Bình" hoặc "An; Bình" → nhiều phần tử riêng, khớp app (rbacService.normalizeSelectedPersonnelNamesInput).
-- Chạy một lần; idempotent nếu dữ liệu đã tách sẵn.
--
-- Yêu cầu: cột selected_personnel kiểu jsonb (mảng chuỗi). Cần PostgreSQL có jsonb_array_elements_text (PG 14+).

CREATE OR REPLACE FUNCTION public.normalize_user_selected_personnel_jsonb(j jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  elem text;
  token text;
  tokens text[];
  ti int;
  acc text[] := ARRAY[]::text[];
  seen boolean;
BEGIN
  IF j IS NULL OR jsonb_typeof(j) = 'null' THEN
    RETURN j;
  END IF;

  IF jsonb_typeof(j) != 'array' THEN
    RETURN j;
  END IF;

  FOR elem IN SELECT * FROM jsonb_array_elements_text(j)
  LOOP
    elem := regexp_replace(trim(both from coalesce(elem, '')), '\s+', ' ', 'g');
    CONTINUE WHEN elem = '';

    tokens := string_to_array(regexp_replace(elem, '[,，;；|]+', ',', 'g'), ',');

    FOR ti IN 1..coalesce(array_length(tokens, 1), 0)
    LOOP
      token := trim(both from tokens[ti]);
      CONTINUE WHEN token = '';
      seen := false;
      IF acc IS NOT NULL THEN
        seen := token = ANY (acc);
      END IF;
      IF NOT seen THEN
        acc := array_append(acc, token);
      END IF;
    END LOOP;
  END LOOP;

  IF acc IS NULL OR coalesce(array_length(acc, 1), 0) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN to_jsonb(acc);
END;
$$;

COMMENT ON FUNCTION public.normalize_user_selected_personnel_jsonb(jsonb) IS
  'Flatten users.selected_personnel: split , ， ; ； | inside each array element; dedupe order-preserving.';

UPDATE public.users u
SET selected_personnel = public.normalize_user_selected_personnel_jsonb(u.selected_personnel)
WHERE u.selected_personnel IS NOT NULL
  AND jsonb_typeof(u.selected_personnel) = 'array'
  AND u.selected_personnel <> public.normalize_user_selected_personnel_jsonb(u.selected_personnel);

-- Giữ function để gọi thủ công sau này (hoặc DROP nếu không muốn):
-- DROP FUNCTION IF EXISTS public.normalize_user_selected_personnel_jsonb(jsonb);
