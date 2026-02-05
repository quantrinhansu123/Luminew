-- =====================================================
-- HELPER: TẠO TÀI KHOẢN ĐĂNG NHẬP MỚI
-- Script này giúp tạo auth account mới một cách dễ dàng
-- =====================================================

-- Function: Tạo auth account mới (với password đã hash)
CREATE OR REPLACE FUNCTION public.create_auth_account(
    p_email TEXT,
    p_password_hash TEXT,  -- Password đã được hash bằng bcrypt
    p_username TEXT DEFAULT NULL,
    p_user_id TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'active',
    p_must_change_password BOOLEAN DEFAULT false
)
RETURNS UUID AS $$
DECLARE
    v_account_id UUID;
    v_user_id TEXT;
BEGIN
    -- Nếu không có user_id, tìm từ email
    IF p_user_id IS NULL THEN
        SELECT id INTO v_user_id
        FROM public.users
        WHERE email = p_email
        LIMIT 1;
    ELSE
        v_user_id := p_user_id;
    END IF;
    
    -- Tạo auth account
    INSERT INTO public.auth_accounts (
        username,
        email,
        password_hash,
        user_id,
        status,
        must_change_password,
        password_changed_at
    ) VALUES (
        p_username,
        p_email,
        p_password_hash,
        v_user_id,
        p_status,
        p_must_change_password,
        NOW()
    )
    RETURNING id INTO v_account_id;
    
    RETURN v_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Đổi mật khẩu
CREATE OR REPLACE FUNCTION public.change_password(
    p_email TEXT,
    p_old_password_hash TEXT,  -- Password cũ đã hash (để verify)
    p_new_password_hash TEXT,   -- Password mới đã hash
    p_changed_by TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_account_id UUID;
    v_current_hash TEXT;
BEGIN
    -- Tìm account
    SELECT id, password_hash INTO v_account_id, v_current_hash
    FROM public.auth_accounts
    WHERE email = p_email
    LIMIT 1;
    
    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'Account not found';
    END IF;
    
    -- Verify old password (trong thực tế, nên verify bằng bcrypt.compareSync ở application layer)
    -- Ở đây chỉ check hash match (không an toàn, chỉ để demo)
    IF v_current_hash != p_old_password_hash THEN
        RAISE EXCEPTION 'Old password incorrect';
    END IF;
    
    -- Lưu password cũ vào history
    PERFORM public.save_password_to_history(
        v_account_id,
        (SELECT user_id FROM public.auth_accounts WHERE id = v_account_id),
        v_current_hash,
        p_changed_by
    );
    
    -- Update password mới
    UPDATE public.auth_accounts
    SET 
        password_hash = p_new_password_hash,
        password_changed_at = NOW(),
        must_change_password = false,
        updated_by = p_changed_by
    WHERE id = v_account_id;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Reset password (dùng token)
CREATE OR REPLACE FUNCTION public.reset_password_with_token(
    p_email TEXT,
    p_reset_token TEXT,
    p_new_password_hash TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_account_id UUID;
BEGIN
    -- Tìm account với token hợp lệ
    SELECT id INTO v_account_id
    FROM public.auth_accounts
    WHERE email = p_email
      AND password_reset_token = p_reset_token
      AND password_reset_expires_at > NOW()
    LIMIT 1;
    
    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'Invalid or expired reset token';
    END IF;
    
    -- Lưu password cũ vào history
    PERFORM public.save_password_to_history(
        v_account_id,
        (SELECT user_id FROM public.auth_accounts WHERE id = v_account_id),
        (SELECT password_hash FROM public.auth_accounts WHERE id = v_account_id),
        'system'
    );
    
    -- Update password mới và clear token
    UPDATE public.auth_accounts
    SET 
        password_hash = p_new_password_hash,
        password_changed_at = NOW(),
        password_reset_token = NULL,
        password_reset_expires_at = NULL,
        must_change_password = false
    WHERE id = v_account_id;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Generate password reset token
CREATE OR REPLACE FUNCTION public.generate_password_reset_token(
    p_email TEXT,
    p_expires_in_minutes INTEGER DEFAULT 60
)
RETURNS TEXT AS $$
DECLARE
    v_token TEXT;
    v_account_id UUID;
BEGIN
    -- Generate random token
    v_token := gen_random_uuid()::text;
    
    -- Find account
    SELECT id INTO v_account_id
    FROM public.auth_accounts
    WHERE email = p_email
    LIMIT 1;
    
    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'Account not found';
    END IF;
    
    -- Update account with token
    UPDATE public.auth_accounts
    SET 
        password_reset_token = v_token,
        password_reset_expires_at = NOW() + (p_expires_in_minutes || ' minutes')::INTERVAL
    WHERE id = v_account_id;
    
    RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Lock/Unlock account
CREATE OR REPLACE FUNCTION public.set_account_status(
    p_email TEXT,
    p_status TEXT,
    p_locked_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_account_id UUID;
BEGIN
    -- Validate status
    IF p_status NOT IN ('active', 'inactive', 'locked', 'suspended') THEN
        RAISE EXCEPTION 'Invalid status. Must be: active, inactive, locked, or suspended';
    END IF;
    
    -- Find account
    SELECT id INTO v_account_id
    FROM public.auth_accounts
    WHERE email = p_email
    LIMIT 1;
    
    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'Account not found';
    END IF;
    
    -- Update status
    UPDATE public.auth_accounts
    SET 
        status = p_status,
        locked_until = CASE 
            WHEN p_status = 'locked' AND p_locked_until IS NOT NULL THEN p_locked_until
            WHEN p_status != 'locked' THEN NULL
            ELSE locked_until
        END,
        login_attempts = CASE 
            WHEN p_status = 'active' THEN 0
            ELSE login_attempts
        END
    WHERE id = v_account_id;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- VÍ DỤ SỬ DỤNG
-- =====================================================

/*
-- 1. Tạo auth account mới
SELECT public.create_auth_account(
    'user@example.com',
    '$2a$10$...',  -- Password đã hash bằng bcrypt
    'username',     -- Optional
    'user-id',      -- Optional, sẽ tự tìm từ email nếu null
    'active',       -- status
    false           -- must_change_password
);

-- 2. Generate password reset token
SELECT public.generate_password_reset_token('user@example.com', 60);

-- 3. Reset password với token
SELECT public.reset_password_with_token(
    'user@example.com',
    'reset-token-here',
    '$2a$10$...'  -- New password hash
);

-- 4. Lock account
SELECT public.set_account_status('user@example.com', 'locked', NOW() + INTERVAL '30 minutes');

-- 5. Unlock account
SELECT public.set_account_status('user@example.com', 'active');
*/

-- =====================================================
-- HOÀN THÀNH!
-- =====================================================
SELECT '✅ Đã tạo các helper functions cho auth accounts!' as message;
SELECT '📝 Các functions có sẵn:' as info;
SELECT '  - create_auth_account(): Tạo account mới' as info;
SELECT '  - change_password(): Đổi mật khẩu' as info;
SELECT '  - reset_password_with_token(): Reset password' as info;
SELECT '  - generate_password_reset_token(): Tạo reset token' as info;
SELECT '  - set_account_status(): Lock/Unlock account' as info;
