-- Trang Đơn chia CSKH HCM (/don-chia-cskh-hcm): mirror quyền từ CSKH_PAID.

INSERT INTO app_page_permissions (role_code, page_code, can_view, can_edit, can_delete, allowed_columns)
SELECT
  role_code,
  'CSKH_PAID_HCM',
  can_view,
  can_edit,
  can_delete,
  allowed_columns
FROM app_page_permissions
WHERE page_code = 'CSKH_PAID'
ON CONFLICT (role_code, page_code) DO UPDATE SET
  can_view = app_page_permissions.can_view OR EXCLUDED.can_view,
  can_edit = app_page_permissions.can_edit OR EXCLUDED.can_edit,
  can_delete = app_page_permissions.can_delete OR EXCLUDED.can_delete,
  allowed_columns = COALESCE(EXCLUDED.allowed_columns, app_page_permissions.allowed_columns);
