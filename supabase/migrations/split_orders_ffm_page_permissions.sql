-- Tách quyền trang FFM gộp (ORDERS_FFM) thành FFM MGT và FFM T&T.
-- Chạy sau khi deploy code dùng ORDERS_FFM_MGT / ORDERS_FFM_TT.

INSERT INTO app_page_permissions (role_code, page_code, can_view, can_edit, can_delete, allowed_columns)
SELECT role_code, 'ORDERS_FFM_MGT', can_view, can_edit, can_delete, allowed_columns
FROM app_page_permissions
WHERE page_code = 'ORDERS_FFM'
ON CONFLICT (role_code, page_code) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete,
  allowed_columns = EXCLUDED.allowed_columns;

INSERT INTO app_page_permissions (role_code, page_code, can_view, can_edit, can_delete, allowed_columns)
SELECT role_code, 'ORDERS_FFM_TT', can_view, can_edit, can_delete, allowed_columns
FROM app_page_permissions
WHERE page_code = 'ORDERS_FFM'
ON CONFLICT (role_code, page_code) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete,
  allowed_columns = EXCLUDED.allowed_columns;

INSERT INTO app_page_permissions (role_code, page_code, can_view, can_edit, can_delete, allowed_columns)
SELECT role_code, 'ORDERS_DIEN_BILL', can_view, can_edit, can_delete, allowed_columns
FROM app_page_permissions
WHERE page_code = 'ORDERS_FFM'
ON CONFLICT (role_code, page_code) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete,
  allowed_columns = EXCLUDED.allowed_columns;

DELETE FROM app_page_permissions WHERE page_code = 'ORDERS_FFM';
