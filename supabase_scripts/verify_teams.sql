-- Script kiểm tra và cập nhật team trong bảng users
-- Chạy script này trong Supabase Dashboard > SQL Editor

-- 1. Kiểm tra trạng thái hiện tại
SELECT 
    email,
    name,
    team as "Team hiện tại",
    department,
    position
FROM users
WHERE email IN (
    'biquan2812@gmail.com',
    'vanhoa28052000@gmail.com',
    'myt189753@gmail.com',
    'anhphung916@gmail.com',
    'dungdungdong1409@gmail.com',
    'pquy05211@gmail.com',
    'hienhien07082001@gmail.com'
)
ORDER BY email;

-- 2. Cập nhật team (nếu cần)
UPDATE users
SET team = 'MKT - Đức Anh 1'
WHERE email = 'biquan2812@gmail.com';

UPDATE users
SET team = 'Đã nghỉ'
WHERE email = 'vanhoa28052000@gmail.com';

UPDATE users
SET team = 'Đã nghỉ'
WHERE email = 'myt189753@gmail.com';

UPDATE users
SET team = 'HN-MKT'
WHERE email = 'anhphung916@gmail.com';

UPDATE users
SET team = 'Vận đơn - Hảo'
WHERE email = 'dungdungdong1409@gmail.com';

UPDATE users
SET team = 'Vận đơn - Quý'
WHERE email = 'pquy05211@gmail.com';

UPDATE users
SET team = 'HCM-Sale Đêm'
WHERE email = 'hienhien07082001@gmail.com';

-- 3. Kiểm tra lại sau khi cập nhật
SELECT 
    email,
    name,
    team as "Team sau cập nhật",
    CASE 
        WHEN email = 'biquan2812@gmail.com' AND team = 'MKT - Đức Anh 1' THEN '✅'
        WHEN email = 'vanhoa28052000@gmail.com' AND team = 'Đã nghỉ' THEN '✅'
        WHEN email = 'myt189753@gmail.com' AND team = 'Đã nghỉ' THEN '✅'
        WHEN email = 'anhphung916@gmail.com' AND team = 'HN-MKT' THEN '✅'
        WHEN email = 'dungdungdong1409@gmail.com' AND team = 'Vận đơn - Hảo' THEN '✅'
        WHEN email = 'pquy05211@gmail.com' AND team = 'Vận đơn - Quý' THEN '✅'
        WHEN email = 'hienhien07082001@gmail.com' AND team = 'HCM-Sale Đêm' THEN '✅'
        ELSE '❌'
    END as "Trạng thái"
FROM users
WHERE email IN (
    'biquan2812@gmail.com',
    'vanhoa28052000@gmail.com',
    'myt189753@gmail.com',
    'anhphung916@gmail.com',
    'dungdungdong1409@gmail.com',
    'pquy05211@gmail.com',
    'hienhien07082001@gmail.com'
)
ORDER BY email;
