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
    console.log('📋 Kiểm tra bảng users (bảng đăng nhập)...\n');
    
    try {
        // Đếm tổng số users
        const { count, error: countError } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true });

        if (countError) {
            console.error('❌ Lỗi khi đếm users:', countError.message);
            throw countError;
        }

        console.log(`📊 Tổng số users: ${count || 0}\n`);

        if (count === 0) {
            console.log('ℹ️  Bảng users đang trống.');
            process.exit(0);
        }

        // Lấy danh sách users (giới hạn 20 để xem)
        const { data: users, error: fetchError } = await supabase
            .from('users')
            .select('id, email, username, name, role, team, department, position')
            .limit(20);

        if (fetchError) {
            console.error('❌ Lỗi khi lấy danh sách users:', fetchError.message);
            throw fetchError;
        }

        if (users && users.length > 0) {
            console.log('👥 Danh sách users (hiển thị 20 đầu tiên):');
            console.log('─'.repeat(100));
            console.log(
                'Email'.padEnd(30) + 
                'Username'.padEnd(20) + 
                'Name'.padEnd(20) + 
                'Role'.padEnd(10) + 
                'Team'.padEnd(15)
            );
            console.log('─'.repeat(100));

            users.forEach(user => {
                console.log(
                    (user.email || '').padEnd(30) +
                    (user.username || '').padEnd(20) +
                    (user.name || '').padEnd(20) +
                    (user.role || '').padEnd(10) +
                    (user.team || '').padEnd(15)
                );
            });

            console.log('─'.repeat(100));
            console.log(`\n📝 Các trường quan trọng cho đăng nhập:`);
            console.log(`   - email: Dùng để tìm user (unique)`);
            console.log(`   - password: Mật khẩu đã hash (bcrypt)`);
            console.log(`   - role: Quyền truy cập (admin, leader, user)`);
            console.log(`   - team: Team/Phòng ban của user`);
            console.log(`\n💡 Để xem tất cả users, hãy chạy query trong Supabase Dashboard.`);
        }

        // Kiểm tra users có password
        const { count: usersWithPassword, error: passwordCheckError } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .not('password', 'is', null);

        if (!passwordCheckError) {
            console.log(`\n🔐 Số users có mật khẩu: ${usersWithPassword || 0}`);
            console.log(`   Số users chưa có mật khẩu: ${(count || 0) - (usersWithPassword || 0)}`);
        }

    } catch (error) {
        console.error('❌ Lỗi:', error.message);
        console.error('Chi tiết:', error);
        process.exit(1);
    }
})();
