-- Complete Permissions Setup for All Roles
-- This script adds all necessary permissions for all departments

-- ============================================
-- SALE PERMISSIONS
-- ============================================
INSERT INTO app_page_permissions (role_code, page_code, can_view, can_edit, can_delete)
VALUES
    ('sale', 'SALE_ORDERS', true, true, false),
    ('sale', 'SALE_NEW_ORDER', true, true, true),
    ('sale', 'SALE_INPUT', true, true, false),
    ('sale', 'SALE_VIEW', true, false, false),
    ('sale', 'SALE_MANUAL', true, false, false),
    ('sale', 'SALE_HISTORY', true, false, false)
ON CONFLICT (role_code, page_code) DO UPDATE SET
    can_view = EXCLUDED.can_view, can_edit = EXCLUDED.can_edit, can_delete = EXCLUDED.can_delete, updated_at = NOW();

-- ============================================
-- CSKH PERMISSIONS
-- ============================================
INSERT INTO app_page_permissions (role_code, page_code, can_view, can_edit, can_delete)
VALUES
    ('cskh', 'CSKH_LIST', true, true, false),
    ('cskh', 'CSKH_PAID', true, true, false),
    ('cskh', 'CSKH_NEW_ORDER', true, true, true),
    ('cskh', 'CSKH_INPUT', true, true, false),
    ('cskh', 'CSKH_VIEW', true, false, false),
    ('cskh', 'CSKH_HISTORY', true, false, false)
ON CONFLICT (role_code, page_code) DO UPDATE SET
    can_view = EXCLUDED.can_view, can_edit = EXCLUDED.can_edit, can_delete = EXCLUDED.can_delete, updated_at = NOW();

-- ============================================
-- MARKETING PERMISSIONS
-- ============================================
INSERT INTO app_page_permissions (role_code, page_code, can_view, can_edit, can_delete)
VALUES
    ('marketing', 'MKT_INPUT', true, true, false),
    ('marketing', 'MKT_VIEW', true, false, false),
    ('marketing', 'MKT_ORDERS', true, true, false),
    ('marketing', 'MKT_PAGES', true, true, true),
    ('marketing', 'MKT_MANUAL', true, false, false)
ON CONFLICT (role_code, page_code) DO UPDATE SET
    can_view = EXCLUDED.can_view, can_edit = EXCLUDED.can_edit, can_delete = EXCLUDED.can_delete, updated_at = NOW();

-- ============================================
-- R&D PERMISSIONS
-- ============================================
INSERT INTO app_page_permissions (role_code, page_code, can_view, can_edit, can_delete)
VALUES
    ('rnd', 'RND_INPUT', true, true, false),
    ('rnd', 'RND_VIEW', true, false, false),
    ('rnd', 'RND_ORDERS', true, true, false),
    ('rnd', 'RND_PAGES', true, true, true),
    ('rnd', 'RND_MANUAL', true, false, false),
    ('rnd', 'RND_NEW_ORDER', true, true, true),
    ('rnd', 'RND_HISTORY', true, false, false)
ON CONFLICT (role_code, page_code) DO UPDATE SET
    can_view = EXCLUDED.can_view, can_edit = EXCLUDED.can_edit, can_delete = EXCLUDED.can_delete, updated_at = NOW();

-- ============================================
-- DELIVERY/WAREHOUSE PERMISSIONS
-- ============================================
INSERT INTO app_page_permissions (role_code, page_code, can_view, can_edit, can_delete)
VALUES
    ('delivery', 'ORDERS_LIST', true, true, false),
    ('delivery', 'ORDERS_HISTORY', true, false, false),
    ('delivery', 'ORDERS_FFM', true, true, false)
ON CONFLICT (role_code, page_code) DO UPDATE SET
    can_view = EXCLUDED.can_view, can_edit = EXCLUDED.can_edit, can_delete = EXCLUDED.can_delete, updated_at = NOW();

-- ============================================
-- LEADER PERMISSIONS (Full Access)
-- ============================================
INSERT INTO app_page_permissions (role_code, page_code, can_view, can_edit, can_delete)
SELECT 'leader', page_code, true, true, true
FROM (
    VALUES 
        ('SALE_ORDERS'), ('SALE_NEW_ORDER'), ('SALE_INPUT'), ('SALE_VIEW'), ('SALE_MANUAL'), ('SALE_HISTORY'),
        ('CSKH_LIST'), ('CSKH_PAID'), ('CSKH_NEW_ORDER'), ('CSKH_INPUT'), ('CSKH_VIEW'), ('CSKH_HISTORY'),
        ('MKT_INPUT'), ('MKT_VIEW'), ('MKT_ORDERS'), ('MKT_PAGES'), ('MKT_MANUAL'),
        ('RND_INPUT'), ('RND_VIEW'), ('RND_ORDERS'), ('RND_PAGES'), ('RND_MANUAL'), ('RND_NEW_ORDER'), ('RND_HISTORY'),
        ('ORDERS_LIST'), ('ORDERS_HISTORY'), ('ORDERS_FFM')
) AS codes(page_code)
ON CONFLICT (role_code, page_code) DO UPDATE SET
    can_view = true, can_edit = true, can_delete = true, updated_at = NOW();

-- ============================================
-- VERIFICATION QUERY
-- ============================================
SELECT 
    role_code,
    COUNT(*) as total_permissions,
    SUM(CASE WHEN can_view THEN 1 ELSE 0 END) as can_view_count,
    SUM(CASE WHEN can_edit THEN 1 ELSE 0 END) as can_edit_count,
    SUM(CASE WHEN can_delete THEN 1 ELSE 0 END) as can_delete_count
FROM app_page_permissions
WHERE role_code IN ('sale', 'cskh', 'marketing', 'rnd', 'delivery', 'leader')
GROUP BY role_code
ORDER BY role_code;
