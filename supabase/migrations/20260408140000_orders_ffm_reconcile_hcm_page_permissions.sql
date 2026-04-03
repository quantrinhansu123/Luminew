-- Trang đối soát đẩy FFM HCM (/bang-doi-soat-day-ffm-hcm): mirror quyền từ ORDERS_FFM_RECONCILE.

INSERT INTO app_page_permissions (role_code, page_code, can_view, can_edit, can_delete, allowed_columns)
SELECT
  role_code,
  'ORDERS_FFM_RECONCILE_HCM',
  can_view,
  false,
  false,
  allowed_columns
FROM app_page_permissions
WHERE page_code = 'ORDERS_FFM_RECONCILE'
ON CONFLICT (role_code, page_code) DO UPDATE SET
  can_view = app_page_permissions.can_view OR EXCLUDED.can_view,
  allowed_columns = COALESCE(EXCLUDED.allowed_columns, app_page_permissions.allowed_columns);

-- Role đã có Vận đơn HCM: cũng bật xem bảng đối soát FFM HCM (nếu chưa có từ bước trên).
INSERT INTO app_page_permissions (role_code, page_code, can_view, can_edit, can_delete, allowed_columns)
SELECT
  role_code,
  'ORDERS_FFM_RECONCILE_HCM',
  can_view,
  false,
  false,
  allowed_columns
FROM app_page_permissions
WHERE page_code = 'ORDERS_LIST_HCM'
ON CONFLICT (role_code, page_code) DO UPDATE SET
  can_view = app_page_permissions.can_view OR EXCLUDED.can_view,
  allowed_columns = COALESCE(EXCLUDED.allowed_columns, app_page_permissions.allowed_columns);
