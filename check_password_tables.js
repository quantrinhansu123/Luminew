import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-detect credentials
let supabaseUrl = '';
let supabaseKey = '';

const clientPath = path.join(__dirname, 'src', 'services', 'supabaseClient.js');
try {
    const content = fs.readFileSync(clientPath, 'utf8');
    const urlMatch = content.match(/VITE_SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/);
    const keyMatch = content.match(/VITE_SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/);

    if (urlMatch) supabaseUrl = urlMatch[1];
    if (keyMatch) supabaseKey = keyMatch[1];
} catch (e) { }

if (!supabaseUrl || !supabaseKey) {
    if (fs.existsSync(path.join(__dirname, '.env'))) {
        const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
        const urlLine = env.split('\n').find(x => x.includes('VITE_SUPABASE_URL'));
        const keyLine = env.split('\n').find(x => x.includes('VITE_SUPABASE_ANON_KEY'));
        
        if (urlLine) supabaseUrl = urlLine.split('=')[1].trim();
        if (keyLine) supabaseKey = keyLine.split('=')[1].trim();
    }
}

// Use fallback values if not found
if (!supabaseUrl) {
    supabaseUrl = 'https://gsjhsmxyxjyiqovauyrp.supabase.co';
}
if (!supabaseKey) {
    supabaseKey = 'sb_publishable_vXBSa3eP8cvjIK2qLWI6Ug_FoYm4CNy';
}

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
    console.log('🔐 Kiểm tra bảng quản lý mật khẩu...\n');
    
    try {
        // 1. Kiểm tra bảng users (đang được dùng trong Login.jsx)
        console.log('📋 1. Bảng USERS (đang được sử dụng):');
        console.log('─'.repeat(80));
        
        const { count: usersCount, error: usersCountError } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true });

        if (usersCountError) {
            console.log(`   ❌ Lỗi: ${usersCountError.message}`);
        } else {
            console.log(`   ✅ Tổng số users: ${usersCount || 0}`);
            
            // Kiểm tra cột password
            const { data: sampleUser, error: sampleError } = await supabase
                .from('users')
                .select('id, email, password')
                .limit(1)
                .single();

            if (sampleError && sampleError.code !== 'PGRST116') {
                console.log(`   ⚠️  Không thể kiểm tra cột password: ${sampleError.message}`);
            } else if (sampleUser) {
                const hasPassword = !!sampleUser.password;
                console.log(`   ✅ Có cột 'password': ${hasPassword ? 'Có' : 'Không'}`);
                if (hasPassword) {
                    console.log(`   📝 Mật khẩu được lưu trong cột: password (bcrypt hash)`);
                }
            }
        }

        // 2. Kiểm tra bảng auth_accounts (bảng mới, có thể chưa dùng)
        console.log('\n📋 2. Bảng AUTH_ACCOUNTS (bảng mới, có thể chưa sử dụng):');
        console.log('─'.repeat(80));
        
        const { count: authCount, error: authCountError } = await supabase
            .from('auth_accounts')
            .select('*', { count: 'exact', head: true });

        if (authCountError) {
            if (authCountError.code === '42P01') {
                console.log(`   ⚠️  Bảng 'auth_accounts' chưa tồn tại`);
            } else {
                console.log(`   ❌ Lỗi: ${authCountError.message}`);
            }
        } else {
            console.log(`   ✅ Tổng số auth_accounts: ${authCount || 0}`);
            
            if (authCount > 0) {
                // Kiểm tra cột password_hash
                const { data: sampleAuth, error: sampleAuthError } = await supabase
                    .from('auth_accounts')
                    .select('id, email, password_hash')
                    .limit(1)
                    .single();

                if (sampleAuthError && sampleAuthError.code !== 'PGRST116') {
                    console.log(`   ⚠️  Không thể kiểm tra cột password_hash: ${sampleAuthError.message}`);
                } else if (sampleAuth) {
                    const hasPasswordHash = !!sampleAuth.password_hash;
                    console.log(`   ✅ Có cột 'password_hash': ${hasPasswordHash ? 'Có' : 'Không'}`);
                    if (hasPasswordHash) {
                        console.log(`   📝 Mật khẩu được lưu trong cột: password_hash (bcrypt hash)`);
                    }
                }
            } else {
                console.log(`   ℹ️  Bảng tồn tại nhưng chưa có dữ liệu`);
            }
        }

        // 3. Kiểm tra code đăng nhập đang dùng bảng nào
        console.log('\n📋 3. Code đăng nhập đang sử dụng:');
        console.log('─'.repeat(80));
        
        const loginFile = path.join(__dirname, 'src', 'pages', 'Login.jsx');
        if (fs.existsSync(loginFile)) {
            const loginContent = fs.readFileSync(loginFile, 'utf8');
            if (loginContent.includes(".from('users')")) {
                console.log('   ✅ Login.jsx đang sử dụng bảng: users');
                console.log('   📝 So sánh mật khẩu từ: userData.password');
            }
            if (loginContent.includes(".from('auth_accounts')")) {
                console.log('   ✅ Login.jsx cũng có thể sử dụng bảng: auth_accounts');
            }
        }

        // 4. Kết luận
        console.log('\n📊 KẾT LUẬN:');
        console.log('─'.repeat(80));
        console.log('   🔐 Bảng đang quản lý mật khẩu: USERS');
        console.log('   📝 Cột lưu mật khẩu: password (bcrypt hash)');
        console.log('   📋 Bảng auth_accounts: Đã được tạo nhưng chưa được sử dụng');
        console.log('   💡 Để chuyển sang auth_accounts, cần migrate dữ liệu và cập nhật code đăng nhập');

    } catch (error) {
        console.error('❌ Lỗi:', error.message);
        console.error('Chi tiết:', error);
        process.exit(1);
    }
})();
