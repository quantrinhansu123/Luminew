import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Vui lòng cấu hình VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trong file .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function exportUsersForMapping() {
    console.log('📥 Đang lấy danh sách users...\n');

    const { data: users, error } = await supabase
        .from('users')
        .select('email, name, team, department, position')
        .order('email');

    if (error) {
        console.error('❌ Lỗi:', error.message);
        return;
    }

    console.log(`✅ Đã lấy ${users.length} users\n`);

    // Tạo file JSON để dễ chỉnh sửa
    const mappingTemplate = {};
    users.forEach(user => {
        if (user.email) {
            mappingTemplate[user.email] = user.team || '';
        }
    });

    const outputFile = join(__dirname, 'users_team_mapping.json');
    fs.writeFileSync(outputFile, JSON.stringify(mappingTemplate, null, 2), 'utf8');

    console.log(`📄 Đã tạo file: ${outputFile}`);
    console.log(`\n📋 Danh sách users (${users.length} users):\n`);
    console.log('Email'.padEnd(40) + ' | Tên'.padEnd(30) + ' | Team hiện tại'.padEnd(25) + ' | Department');
    console.log('-'.repeat(120));

    users.forEach(user => {
        console.log(
            (user.email || 'N/A').padEnd(40) + ' | ' +
            (user.name || 'N/A').substring(0, 28).padEnd(30) + ' | ' +
            (user.team || '(trống)').substring(0, 23).padEnd(25) + ' | ' +
            (user.department || 'N/A')
        );
    });

    console.log('\n💡 Hướng dẫn:');
    console.log('1. Mở file users_team_mapping.json');
    console.log('2. Cập nhật team cho từng email');
    console.log('3. Chạy script update_teams_from_mapping.js để cập nhật vào database');
    console.log('\n✅ Hoàn thành!');
}

exportUsersForMapping().catch(error => {
    console.error('❌ Lỗi:', error);
    process.exit(1);
});
