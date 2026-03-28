-- Bổ sung ORDERS_DIEN_BILL khi DB đã chạy bản split_orders_ffm cũ (chưa có dòng Điền bill).
-- Gán can_view = true nếu role đã được bật xem ít nhất một trong FFM MGT / T&T.
-- allowed_columns: copy từ một dòng MGT/T&T có can_view (cột kiểu text[]).

INSERT INTO app_page_permissions (role_code, page_code, can_view, can_edit, can_delete, allowed_columns)
SELECT
  g.role_code,
  'ORDERS_DIEN_BILL',
  g.any_view,
  false,
  false,
  COALESCE(
    (
      SELECT p2.allowed_columns
      FROM app_page_permissions p2
      WHERE p2.role_code = g.role_code
        AND p2.page_code IN ('ORDERS_FFM_MGT', 'ORDERS_FFM_TT')
        AND p2.can_view = true
      ORDER BY CASE p2.page_code WHEN 'ORDERS_FFM_MGT' THEN 0 ELSE 1 END
      LIMIT 1
    ),
    ARRAY['*']::text[]
  )
FROM (
  SELECT role_code, BOOL_OR(can_view) AS any_view
  FROM app_page_permissions
  WHERE page_code IN ('ORDERS_FFM_MGT', 'ORDERS_FFM_TT')
  GROUP BY role_code
  HAVING BOOL_OR(can_view)
) g
ON CONFLICT (role_code, page_code) DO UPDATE SET
  can_view = app_page_permissions.can_view OR EXCLUDED.can_view,
  allowed_columns = COALESCE(EXCLUDED.allowed_columns, app_page_permissions.allowed_columns);
