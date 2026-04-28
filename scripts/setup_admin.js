
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Thiếu Supabase credentials trong file .env!');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupAdmin() {
    const email = 'admin@marketing.com';
    const password = '123456';
    const saltRounds = 10;
    
    console.log(`🔐 Đang tạo mã hash cho mật khẩu: "${password}"...`);
    const hashedPassword = bcrypt.hashSync(password, saltRounds);
    console.log(`✅ Mã hash tạo ra: ${hashedPassword}`);

    console.log(`📡 Đang cập nhật tài khoản ${email} trên Supabase...`);
    
    const { data, error } = await supabase
        .from('users')
        .upsert({
            email: email,
            name: 'Administrator',
            password: hashedPassword,
            role: 'admin',
            team: 'Hà Nội'
        }, { onConflict: 'email' });

    if (error) {
        console.error('❌ Lỗi khi cập nhật Supabase:', error);
    } else {
        console.log('🚀 THÀNH CÔNG! Bạn có thể đăng nhập ngay bây giờ.');
        console.log(`📧 Email: ${email}`);
        console.log(`🔑 Mật khẩu: ${password}`);
    }
}

setupAdmin();
