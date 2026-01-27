
-- Insert standard roles if they don't exist
INSERT INTO app_roles (code, name, description)
VALUES 
  ('marketing', 'Marketing Staff', 'Nhân viên bộ phận Marketing'),
  ('sale', 'Sale Staff', 'Nhân viên bộ phận Kinh doanh/Sale'),
  ('cskh', 'CSKH Staff', 'Nhân viên bộ phận CSKH'),
  ('delivery', 'Delivery Staff', 'Nhân viên bộ phận Kho/Vận đơn'),
  ('rnd', 'R&D Staff', 'Nhân viên bộ phận R&D'),
  ('hr', 'HR Staff', 'Nhân viên bộ phận Hành chính Nhân sự'),
  ('finance', 'Finance Staff', 'Nhân viên bộ phận Tài chính Kế toán'),
  ('leader', 'Team Leader', 'Quản lý/Trưởng nhóm'),
  ('user', 'Standard User', 'Người dùng cơ bản')
ON CONFLICT (code) DO NOTHING;
