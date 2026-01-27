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

async function clearAllTeams() {
    console.log('⚠️  CẢNH BÁO: Bạn sắp xóa TẤT CẢ dữ liệu trong cột team của bảng users!\n');
    
    // Đếm số users có team
    const { data: users, error: countError } = await supabase
        .from('users')
        .select('email, team')
        .not('team', 'is', null);

    if (countError) {
        console.error('❌ Lỗi khi đếm users:', countError.message);
        return;
    }

    const usersWithTeam = users?.filter(u => u.team && u.team.trim() !== '') || [];
    
    console.log(`📊 Sẽ xóa team của ${usersWithTeam.length} users`);
    console.log(`📋 Tổng số users: ${users?.length || 0}\n`);

    if (usersWithTeam.length === 0) {
        console.log('✅ Không có user nào có team để xóa.');
        return;
    }

    // Hiển thị một số ví dụ
    console.log('📝 Một số users sẽ bị xóa team:');
    usersWithTeam.slice(0, 10).forEach(u => {
        console.log(`   - ${u.email} → Team hiện tại: "${u.team}"`);
    });
    if (usersWithTeam.length > 10) {
        console.log(`   ... và ${usersWithTeam.length - 10} users khác`);
    }

    console.log('\n🔄 Bắt đầu xóa team...\n');

    // Cập nhật tất cả team về null
    const { data, error } = await supabase
        .from('users')
        .update({ team: null })
        .not('team', 'is', null)
        .select('email, team');

    if (error) {
        console.error('❌ Lỗi khi xóa team:', error.message);
        return;
    }

    console.log(`✅ Đã xóa team của ${data?.length || 0} users\n`);

    // Kiểm tra lại
    const { data: verifyUsers, error: verifyError } = await supabase
        .from('users')
        .select('email, team')
        .not('team', 'is', null);

    if (verifyError) {
        console.error('⚠️  Lỗi khi kiểm tra lại:', verifyError.message);
    } else {
        const remaining = verifyUsers?.filter(u => u.team && u.team.trim() !== '') || [];
        if (remaining.length === 0) {
            console.log('✅ Đã xóa thành công! Tất cả users hiện không có team.');
        } else {
            console.log(`⚠️  Còn ${remaining.length} users vẫn có team.`);
        }
    }

    console.log('\n✅ Hoàn thành!');
}

clearAllTeams().catch(error => {
    console.error('❌ Lỗi:', error);
    process.exit(1);
});
