import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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

// Dữ liệu JSON - mapping email -> team
const teamMappings = {
    'biquan2812@gmail.com': 'MKT - Đức Anh 1',
    'vanhoa28052000@gmail.com': 'Đã nghỉ',
    'myt189753@gmail.com': 'Đã nghỉ',
    'anhphung916@gmail.com': 'HN-MKT',
    'dungdungdong1409@gmail.com': 'Vận đơn - Hảo',
    'pquy05211@gmail.com': 'Vận đơn - Quý',
    'hienhien07082001@gmail.com': 'HCM-Sale Đêm'
};

async function forceUpdateTeams() {
    console.log('🔄 Bắt đầu cập nhật team trong bảng users...\n');
    console.log('📋 Danh sách email cần cập nhật:');
    Object.keys(teamMappings).forEach(email => {
        console.log(`   ${email} → ${teamMappings[email]}`);
    });
    console.log('');

    let successCount = 0;
    let errorCount = 0;

    for (const [email, expectedTeam] of Object.entries(teamMappings)) {
        console.log(`\n🔄 Đang xử lý: ${email}`);
        
        // Bước 1: Kiểm tra user hiện tại
        const { data: currentUser, error: fetchError } = await supabase
            .from('users')
            .select('email, team, name, id')
            .eq('email', email)
            .single();

        if (fetchError) {
            console.error(`   ❌ Không tìm thấy user: ${fetchError.message}`);
            errorCount++;
            continue;
        }

        console.log(`   📍 User hiện tại:`);
        console.log(`      ID: ${currentUser.id}`);
        console.log(`      Tên: ${currentUser.name || 'N/A'}`);
        console.log(`      Team hiện tại: "${currentUser.team || '(trống)'}"`);
        console.log(`      Team cần cập nhật: "${expectedTeam}"`);

        // Bước 2: Cập nhật team
        const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update({ team: expectedTeam })
            .eq('email', email)
            .select();

        if (updateError) {
            console.error(`   ❌ Lỗi cập nhật: ${updateError.message}`);
            errorCount++;
            continue;
        }

        // Bước 3: Kiểm tra lại sau khi cập nhật
        const { data: verifyUser, error: verifyError } = await supabase
            .from('users')
            .select('email, team')
            .eq('email', email)
            .single();

        if (verifyError) {
            console.error(`   ⚠️  Lỗi khi kiểm tra lại: ${verifyError.message}`);
        } else {
            if (verifyUser.team === expectedTeam) {
                console.log(`   ✅ Đã cập nhật thành công!`);
                console.log(`      Team sau cập nhật: "${verifyUser.team}"`);
                successCount++;
            } else {
                console.error(`   ❌ Team không khớp!`);
                console.error(`      Mong đợi: "${expectedTeam}"`);
                console.error(`      Thực tế: "${verifyUser.team || '(trống)'}"`);
                errorCount++;
            }
        }
    }

    // Tổng kết
    console.log('\n' + '='.repeat(80));
    console.log('📊 KẾT QUẢ CUỐI CÙNG');
    console.log('='.repeat(80));
    console.log(`✅ Thành công: ${successCount} users`);
    console.log(`❌ Lỗi: ${errorCount} users`);
    console.log(`📋 Tổng số: ${Object.keys(teamMappings).length} users`);

    // Kiểm tra lại tất cả
    console.log('\n🔍 Kiểm tra lại tất cả users sau khi cập nhật:\n');
    const { data: allUsers, error: finalCheckError } = await supabase
        .from('users')
        .select('email, team, name')
        .in('email', Object.keys(teamMappings))
        .order('email');

    if (!finalCheckError && allUsers) {
        console.log('Email'.padEnd(35) + ' | Tên'.padEnd(25) + ' | Team trong DB');
        console.log('-'.repeat(80));
        allUsers.forEach(user => {
            const expected = teamMappings[user.email?.toLowerCase()];
            const match = user.team === expected ? '✅' : '❌';
            console.log(
                `${match} ${(user.email || 'N/A').padEnd(33)} | ` +
                `${(user.name || 'N/A').substring(0, 23).padEnd(25)} | ` +
                `${user.team || '(trống)'}`
            );
            if (user.team !== expected) {
                console.log(`   ⚠️  Mong đợi: "${expected}"`);
            }
        });
    }

    console.log('\n✅ Hoàn thành!');
}

forceUpdateTeams().catch(error => {
    console.error('❌ Lỗi:', error);
    process.exit(1);
});
