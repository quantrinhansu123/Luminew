-- ============================================================================
-- TẠM THỜI DISABLE RLS ĐỂ TEST (CHỈ DÙNG KHI CẦN THIẾT)
-- ============================================================================

-- Option 1: Tạm thời disable RLS để test
ALTER TABLE app_page_permissions DISABLE ROW LEVEL SECURITY;

-- Sau khi test xong, nên enable lại và tạo policy đúng:
-- ALTER TABLE app_page_permissions ENABLE ROW LEVEL SECURITY;
