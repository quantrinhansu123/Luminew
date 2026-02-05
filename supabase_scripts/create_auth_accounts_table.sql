-- =====================================================
-- TẠO BẢNG QUẢN LÝ TÀI KHOẢN ĐĂNG NHẬP VÀ MẬT KHẨU
-- Bảng này quản lý riêng phần authentication, tách biệt với bảng users
-- =====================================================

-- 1. Bảng auth_accounts - Quản lý tài khoản đăng nhập
CREATE TABLE IF NOT EXISTS public.auth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Thông tin đăng nhập
  username TEXT UNIQUE,           -- Username (có thể null nếu chỉ dùng email)
  email TEXT UNIQUE NOT NULL,     -- Email (bắt buộc, unique)
  password_hash TEXT NOT NULL,    -- Mật khẩu đã hash (bcrypt)
  
  -- Liên kết với bảng users
  user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
  
  -- Trạng thái tài khoản
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'locked', 'suspended')),
  
  -- Bảo mật
  login_attempts INTEGER DEFAULT 0,              -- Số lần đăng nhập sai
  locked_until TIMESTAMPTZ,                     -- Khóa đến khi nào (nếu bị khóa)
  last_login_at TIMESTAMPTZ,                    -- Lần đăng nhập cuối
  last_login_ip TEXT,                           -- IP đăng nhập cuối
  last_login_device TEXT,                       -- Thiết bị đăng nhập cuối
  
  -- Quản lý mật khẩu
  password_changed_at TIMESTAMPTZ DEFAULT NOW(), -- Lần đổi mật khẩu cuối
  password_expires_at TIMESTAMPTZ,              -- Mật khẩu hết hạn khi nào (null = không hết hạn)
  must_change_password BOOLEAN DEFAULT false,   -- Bắt buộc đổi mật khẩu lần đầu
  
  -- Reset password
  password_reset_token TEXT,                     -- Token để reset password
  password_reset_expires_at TIMESTAMPTZ,        -- Token hết hạn khi nào
  
  -- Two-factor authentication (2FA)
  two_factor_enabled BOOLEAN DEFAULT false,      -- Bật 2FA
  two_factor_secret TEXT,                        -- Secret key cho 2FA
  backup_codes TEXT[],                           -- Backup codes cho 2FA
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT,
  
  -- Constraint: Phải có ít nhất username hoặc email
  CONSTRAINT auth_accounts_username_or_email CHECK (
    (username IS NOT NULL AND username != '') OR 
    (email IS NOT NULL AND email != '')
  )
);

-- 2. Bảng login_history - Lịch sử đăng nhập
CREATE TABLE IF NOT EXISTS public.login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Liên kết với auth_accounts
  auth_account_id UUID REFERENCES public.auth_accounts(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  
  -- Thông tin đăng nhập
  email TEXT NOT NULL,              -- Email đăng nhập
  login_at TIMESTAMPTZ DEFAULT NOW(), -- Thời gian đăng nhập
  login_ip TEXT,                     -- IP address
  user_agent TEXT,                   -- User agent (browser/device info)
  device_type TEXT,                   -- mobile, desktop, tablet
  browser TEXT,                       -- Chrome, Firefox, Safari, etc.
  os TEXT,                           -- Windows, macOS, iOS, Android, etc.
  
  -- Kết quả đăng nhập
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'blocked')), -- Trạng thái
  failure_reason TEXT,               -- Lý do thất bại (nếu status = 'failed')
  
  -- Location (nếu có)
  country TEXT,
  city TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  
  -- Session info
  session_id TEXT,                   -- Session ID (nếu có)
  session_duration INTEGER,           -- Thời gian session (giây)
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Bảng password_history - Lịch sử mật khẩu (để tránh dùng lại mật khẩu cũ)
CREATE TABLE IF NOT EXISTS public.password_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Liên kết với auth_accounts
  auth_account_id UUID REFERENCES public.auth_accounts(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  
  -- Mật khẩu cũ (đã hash)
  password_hash TEXT NOT NULL,
  
  -- Metadata
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  changed_by TEXT,
  
  -- Constraint: Không cho phép trùng password_hash trong vòng X ngày
  -- (Có thể thêm trigger để enforce)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES để tăng hiệu suất truy vấn
-- =====================================================

-- Indexes cho auth_accounts
CREATE INDEX IF NOT EXISTS idx_auth_accounts_email ON public.auth_accounts(email);
CREATE INDEX IF NOT EXISTS idx_auth_accounts_username ON public.auth_accounts(username);
CREATE INDEX IF NOT EXISTS idx_auth_accounts_user_id ON public.auth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_accounts_status ON public.auth_accounts(status);
CREATE INDEX IF NOT EXISTS idx_auth_accounts_reset_token ON public.auth_accounts(password_reset_token) WHERE password_reset_token IS NOT NULL;

-- Indexes cho login_history
CREATE INDEX IF NOT EXISTS idx_login_history_auth_account_id ON public.login_history(auth_account_id);
CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON public.login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_email ON public.login_history(email);
CREATE INDEX IF NOT EXISTS idx_login_history_login_at ON public.login_history(login_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_status ON public.login_history(status);
CREATE INDEX IF NOT EXISTS idx_login_history_ip ON public.login_history(login_ip);

-- Indexes cho password_history
CREATE INDEX IF NOT EXISTS idx_password_history_auth_account_id ON public.password_history(auth_account_id);
CREATE INDEX IF NOT EXISTS idx_password_history_user_id ON public.password_history(user_id);
CREATE INDEX IF NOT EXISTS idx_password_history_changed_at ON public.password_history(changed_at DESC);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Bật RLS cho tất cả bảng
ALTER TABLE public.auth_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_history ENABLE ROW LEVEL SECURITY;

-- Policies cho auth_accounts
-- Admin có thể xem tất cả
CREATE POLICY "Admin view all auth accounts" ON public.auth_accounts FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid()::text 
    AND LOWER(role) IN ('admin', 'administrator', 'super_admin', 'director', 'manager')
  ) OR auth.uid() IS NULL
);

-- User chỉ xem được account của chính mình
CREATE POLICY "Users view own auth account" ON public.auth_accounts FOR SELECT
USING (
  user_id = auth.uid()::text OR
  email = (SELECT email FROM public.users WHERE id = auth.uid()::text)
);

-- Admin có thể sửa tất cả
CREATE POLICY "Admin modify all auth accounts" ON public.auth_accounts FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid()::text 
    AND LOWER(role) IN ('admin', 'administrator', 'super_admin', 'director', 'manager')
  ) OR auth.uid() IS NULL
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid()::text 
    AND LOWER(role) IN ('admin', 'administrator', 'super_admin', 'director', 'manager')
  ) OR auth.uid() IS NULL
);

-- User chỉ sửa được account của chính mình (nhưng không được sửa password_hash trực tiếp)
CREATE POLICY "Users modify own auth account" ON public.auth_accounts FOR UPDATE
USING (user_id = auth.uid()::text)
WITH CHECK (
  user_id = auth.uid()::text AND
  -- Không cho phép user tự sửa password_hash trực tiếp (phải qua API)
  password_hash = (SELECT password_hash FROM public.auth_accounts WHERE id = auth_accounts.id)
);

-- Policies cho login_history
-- Admin xem tất cả
CREATE POLICY "Admin view all login history" ON public.login_history FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid()::text 
    AND LOWER(role) IN ('admin', 'administrator', 'super_admin', 'director', 'manager')
  ) OR auth.uid() IS NULL
);

-- User chỉ xem lịch sử của chính mình
CREATE POLICY "Users view own login history" ON public.login_history FOR SELECT
USING (
  user_id = auth.uid()::text OR
  email = (SELECT email FROM public.users WHERE id = auth.uid()::text)
);

-- Policies cho password_history
-- Admin xem tất cả
CREATE POLICY "Admin view all password history" ON public.password_history FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid()::text 
    AND LOWER(role) IN ('admin', 'administrator', 'super_admin', 'director', 'manager')
  ) OR auth.uid() IS NULL
);

-- User không được xem password history (bảo mật)
-- Chỉ admin mới xem được

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Function: Tự động update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Tự động update updated_at cho auth_accounts
DROP TRIGGER IF EXISTS update_auth_accounts_updated_at ON public.auth_accounts;
CREATE TRIGGER update_auth_accounts_updated_at
    BEFORE UPDATE ON public.auth_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Function: Tự động unlock account sau X phút (nếu bị lock)
CREATE OR REPLACE FUNCTION public.auto_unlock_account()
RETURNS TRIGGER AS $$
BEGIN
    -- Nếu account bị lock và locked_until đã qua, tự động unlock
    IF NEW.status = 'locked' AND NEW.locked_until IS NOT NULL AND NEW.locked_until < NOW() THEN
        NEW.status = 'active';
        NEW.login_attempts = 0;
        NEW.locked_until = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Tự động unlock account
DROP TRIGGER IF EXISTS auto_unlock_auth_account ON public.auth_accounts;
CREATE TRIGGER auto_unlock_auth_account
    BEFORE UPDATE ON public.auth_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_unlock_account();

-- Function: Log login history
CREATE OR REPLACE FUNCTION public.log_login_attempt(
    p_auth_account_id UUID,
    p_user_id TEXT,
    p_email TEXT,
    p_status TEXT,
    p_login_ip TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_failure_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_history_id UUID;
BEGIN
    INSERT INTO public.login_history (
        auth_account_id,
        user_id,
        email,
        status,
        login_ip,
        user_agent,
        failure_reason
    ) VALUES (
        p_auth_account_id,
        p_user_id,
        p_email,
        p_status,
        p_login_ip,
        p_user_agent,
        p_failure_reason
    )
    RETURNING id INTO v_history_id;
    
    -- Update last_login_at nếu login thành công
    IF p_status = 'success' THEN
        UPDATE public.auth_accounts
        SET 
            last_login_at = NOW(),
            last_login_ip = p_login_ip,
            login_attempts = 0  -- Reset login attempts
        WHERE id = p_auth_account_id;
    ELSE
        -- Tăng login_attempts nếu login thất bại
        UPDATE public.auth_accounts
        SET 
            login_attempts = login_attempts + 1,
            -- Lock account sau 5 lần thất bại
            status = CASE 
                WHEN login_attempts + 1 >= 5 THEN 'locked'
                ELSE status
            END,
            locked_until = CASE 
                WHEN login_attempts + 1 >= 5 THEN NOW() + INTERVAL '30 minutes'
                ELSE locked_until
            END
        WHERE id = p_auth_account_id;
    END IF;
    
    RETURN v_history_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Lưu password vào history khi đổi mật khẩu
CREATE OR REPLACE FUNCTION public.save_password_to_history(
    p_auth_account_id UUID,
    p_user_id TEXT,
    p_old_password_hash TEXT,
    p_changed_by TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_history_id UUID;
BEGIN
    INSERT INTO public.password_history (
        auth_account_id,
        user_id,
        password_hash,
        changed_by
    ) VALUES (
        p_auth_account_id,
        p_user_id,
        p_old_password_hash,
        p_changed_by
    )
    RETURNING id INTO v_history_id;
    
    RETURN v_history_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- VIEWS (Tùy chọn - để dễ query)
-- =====================================================

-- View: Tổng hợp thông tin auth account với user info
CREATE OR REPLACE VIEW public.auth_accounts_with_users AS
SELECT 
    aa.id,
    aa.username,
    aa.email,
    aa.status,
    aa.login_attempts,
    aa.last_login_at,
    aa.last_login_ip,
    aa.password_changed_at,
    aa.must_change_password,
    aa.two_factor_enabled,
    aa.created_at,
    aa.updated_at,
    u.id as user_id,
    u.name as user_name,
    u.role as user_role,
    u.team as user_team,
    u.department as user_department
FROM public.auth_accounts aa
LEFT JOIN public.users u ON aa.user_id = u.id;

-- View: Thống kê đăng nhập theo ngày
CREATE OR REPLACE VIEW public.login_stats_daily AS
SELECT 
    DATE(login_at) as login_date,
    status,
    COUNT(*) as login_count,
    COUNT(DISTINCT email) as unique_users,
    COUNT(DISTINCT login_ip) as unique_ips
FROM public.login_history
GROUP BY DATE(login_at), status
ORDER BY login_date DESC, status;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant quyền cho authenticated users (nếu cần)
-- GRANT SELECT, INSERT, UPDATE ON public.auth_accounts TO authenticated;
-- GRANT SELECT ON public.login_history TO authenticated;
-- GRANT SELECT ON public.password_history TO authenticated;

-- =====================================================
-- HOÀN THÀNH!
-- =====================================================
SELECT '✅ Đã tạo bảng quản lý tài khoản đăng nhập và mật khẩu thành công!' as message;
SELECT '📋 Các bảng đã tạo:' as info;
SELECT '  - auth_accounts: Quản lý tài khoản đăng nhập' as info;
SELECT '  - login_history: Lịch sử đăng nhập' as info;
SELECT '  - password_history: Lịch sử mật khẩu' as info;
