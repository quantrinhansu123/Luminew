-- Trang FFM MGT HCM (/ffm_MGT-hcm): cùng cấu hình quyền/cột với ORDERS_FFM_MGT.

INSERT INTO app_page_permissions (role_code, page_code, can_view, can_edit, can_delete, allowed_columns)
SELECT
  role_code,
  'ORDERS_FFM_MGT_HCM',
  can_view,
  false,
  false,
  allowed_columns
FROM app_page_permissions
WHERE page_code = 'ORDERS_FFM_MGT'
ON CONFLICT (role_code, page_code) DO UPDATE SET
  can_view = app_page_permissions.can_view OR EXCLUDED.can_view,
  allowed_columns = COALESCE(EXCLUDED.allowed_columns, app_page_permissions.allowed_columns);
