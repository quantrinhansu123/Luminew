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

// Dữ liệu JSON
const teamData = [
  {
    "id": "134f3c31",
    "full_name": "Nguyễn Quang Minh",
    "department": "MKT",
    "position": "Leader",
    "email": "biquan2812@gmail.com",
    "team": "MKT - Đức Anh 1"
  },
  {
    "id": "2b36fb1e",
    "full_name": "Lê Văn Hoà",
    "department": "MKT",
    "position": "Đã nghỉ",
    "email": "vanhoa28052000@gmail.com",
    "team": "Đã nghỉ"
  },
  {
    "id": "40f82e24",
    "full_name": "Trịnh Thị My",
    "department": "Sale",
    "position": "NV",
    "email": "myt189753@gmail.com",
    "team": "Đã nghỉ"
  },
  {
    "id": "5cb43d3b",
    "full_name": "Phùng Kim Anh",
    "department": "MKT",
    "position": "Leader",
    "email": "anhphung916@gmail.com",
    "team": "HN-MKT"
  },
  {
    "id": "e0a6c119",
    "full_name": "Đồng Tố Dũng",
    "department": "Vận Đơn",
    "position": "Leader",
    "email": "dungdungdong1409@gmail.com",
    "team": "Vận đơn - Hảo"
  },
  {
    "id": "fgfdgd105",
    "full_name": "Phạm Trọng Quý",
    "department": "Vận Đơn",
    "position": "Leader",
    "email": "pquy05211@gmail.com",
    "team": "Vận đơn - Quý"
  },
  {
    "id": "fgfdgd93",
    "full_name": "Đỗ Thúy Hiền",
    "department": "Sale",
    "position": "Sale Leader",
    "email": "hienhien07082001@gmail.com",
    "team": "HCM-Sale Đêm"
  }
];

async function checkAndUpdateTeams() {
    console.log('🔍 Kiểm tra và cập nhật team trong Supabase...\n');

    // Tạo map email -> team
    const emailToTeamMap = {};
    teamData.forEach(item => {
        if (item.email && item.team) {
            emailToTeamMap[item.email.toLowerCase().trim()] = item.team;
        }
    });

    console.log(`📋 Đã load ${Object.keys(emailToTeamMap).length} email từ JSON\n`);

    // Lấy tất cả users từ database
    console.log('📥 Đang lấy danh sách users từ Supabase...');
    const { data: users, error: fetchError } = await supabase
        .from('users')
        .select('email, team, name, id')
        .order('email');

    if (fetchError) {
        console.error('❌ Lỗi khi lấy danh sách users:', fetchError.message);
        return;
    }

    console.log(`✅ Đã lấy ${users.length} users từ database\n`);

    // Hiển thị trạng thái hiện tại
    console.log('📊 TRẠNG THÁI HIỆN TẠI:');
    console.log('='.repeat(80));
    console.log('Email'.padEnd(35) + ' | Tên'.padEnd(25) + ' | Team hiện tại'.padEnd(20) + ' | Team mới');
    console.log('-'.repeat(80));

    let updatedCount = 0;
    let noChangeCount = 0;
    let notFoundCount = 0;
    const updates = [];

    for (const user of users) {
        const emailLower = user.email?.toLowerCase().trim();
        const newTeam = emailToTeamMap[emailLower];
        const currentTeam = user.team || '(trống)';
        const newTeamDisplay = newTeam || '(không có trong JSON)';

        console.log(
            (user.email || 'N/A').padEnd(35) + ' | ' +
            (user.name || 'N/A').substring(0, 23).padEnd(25) + ' | ' +
            String(currentTeam).substring(0, 18).padEnd(20) + ' | ' +
            newTeamDisplay
        );

        if (newTeam) {
            if (user.team !== newTeam) {
                updates.push({ email: user.email, currentTeam: user.team, newTeam: newTeam });
            } else {
                noChangeCount++;
            }
        } else {
            notFoundCount++;
        }
    }

    console.log('-'.repeat(80));
    console.log(`\n📊 Tổng kết:`);
    console.log(`   - Cần cập nhật: ${updates.length} users`);
    console.log(`   - Không thay đổi: ${noChangeCount} users`);
    console.log(`   - Không có trong JSON: ${notFoundCount} users`);

    if (updates.length === 0) {
        console.log('\n✅ Tất cả team đã đúng, không cần cập nhật!');
        return;
    }

    // Hỏi xác nhận và cập nhật
    console.log('\n🔄 Bắt đầu cập nhật team...\n');

    for (const update of updates) {
        console.log(`📝 Cập nhật: ${update.email}`);
        console.log(`   Team cũ: ${update.currentTeam || '(trống)'}`);
        console.log(`   Team mới: ${update.newTeam}`);

        const { data, error } = await supabase
            .from('users')
            .update({ team: update.newTeam })
            .eq('email', update.email)
            .select();

        if (error) {
            console.error(`   ❌ Lỗi: ${error.message}\n`);
        } else {
            console.log(`   ✅ Đã cập nhật thành công\n`);
            updatedCount++;
        }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 KẾT QUẢ CUỐI CÙNG');
    console.log('='.repeat(80));
    console.log(`✅ Đã cập nhật: ${updatedCount} users`);
    console.log(`⏭️  Không thay đổi: ${noChangeCount} users`);
    console.log(`❌ Không có trong JSON: ${notFoundCount} users`);

    // Kiểm tra lại sau khi cập nhật
    console.log('\n🔍 Kiểm tra lại sau khi cập nhật...\n');
    const { data: updatedUsers, error: checkError } = await supabase
        .from('users')
        .select('email, team, name')
        .in('email', teamData.map(d => d.email));

    if (!checkError && updatedUsers) {
        console.log('📋 Trạng thái sau cập nhật:');
        console.log('-'.repeat(80));
        updatedUsers.forEach(u => {
            const expectedTeam = emailToTeamMap[u.email?.toLowerCase().trim()];
            const status = u.team === expectedTeam ? '✅' : '❌';
            console.log(`${status} ${u.email} → Team: ${u.team || '(trống)'} (mong đợi: ${expectedTeam || 'N/A'})`);
        });
    }

    console.log('\n✅ Hoàn thành!');
}

checkAndUpdateTeams().catch(error => {
    console.error('❌ Lỗi:', error);
    process.exit(1);
});
