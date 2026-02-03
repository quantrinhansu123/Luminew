import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

// Dữ liệu JSON được cung cấp
const teamData = [
  {
    "id": "134f3c31",
    "full_name": "Nguyễn Quang Minh",
    "department": "MKT",
    "position": "Leader",
    "email": "biquan2812@gmail.com",
    "phone": null,
    "team": "MKT - Đức Anh 1",
    "branch": "HCM",
    "shift": "Ca Ngày",
    "shipping_position": null,
    "shipping_link": null,
    "team_sale_mar": "MKT - Đức Anh 1"
  },
  {
    "id": "2b36fb1e",
    "full_name": "Lê Văn Hoà",
    "department": "MKT",
    "position": "Đã nghỉ",
    "email": "vanhoa28052000@gmail.com",
    "phone": null,
    "team": "Đã nghỉ",
    "branch": "HCM",
    "shift": "Ca Ngày",
    "shipping_position": null,
    "shipping_link": null,
    "team_sale_mar": "MKT - Đức Anh"
  },
  {
    "id": "40f82e24",
    "full_name": "Trịnh Thị My",
    "department": "Sale",
    "position": "NV",
    "email": "myt189753@gmail.com",
    "phone": null,
    "team": "Đã nghỉ",
    "branch": "HCM",
    "shift": "Ca Ngày",
    "shipping_position": null,
    "shipping_link": null,
    "team_sale_mar": "HIENDTT-N"
  },
  {
    "id": "5cb43d3b",
    "full_name": "Phùng Kim Anh",
    "department": "MKT",
    "position": "Leader",
    "email": "anhphung916@gmail.com",
    "phone": "0963345863",
    "team": "HN-MKT",
    "branch": "Hà Nội",
    "shift": "Ca Ngày",
    "shipping_position": null,
    "shipping_link": null,
    "team_sale_mar": "HN-MKT"
  },
  {
    "id": "e0a6c119",
    "full_name": "Đồng Tố Dũng",
    "department": "Vận Đơn",
    "position": "Leader",
    "email": "dungdungdong1409@gmail.com",
    "phone": null,
    "team": "Vận đơn - Hảo",
    "branch": "Hà Nội",
    "shift": "Ca Ngày",
    "shipping_position": "NV",
    "shipping_link": "https://docs.google.com/spreadsheets/d/1EAD3Uh8RvMkZdBUKeZV39d7Ilhzcl44_WlIH2SsiND0/edit",
    "team_sale_mar": "Vận đơn - Hảo"
  },
  {
    "id": "fgfdgd105",
    "full_name": "Phạm Trọng Quý",
    "department": "Vận Đơn",
    "position": "Leader",
    "email": "pquy05211@gmail.com",
    "phone": null,
    "team": "Vận đơn - Quý",
    "branch": "HCM",
    "shift": "Ca Đêm",
    "shipping_position": "Lên đơn FFM",
    "shipping_link": "https://docs.google.com/spreadsheets/d/1lqE0rdto-N4oyr4WanekCx7QKHwIg_yKkowTmNovHWM/edit",
    "team_sale_mar": "Vận đơn - Quý"
  },
  {
    "id": "fgfdgd93",
    "full_name": "Đỗ Thúy Hiền",
    "department": "Sale",
    "position": "Sale Leader",
    "email": "hienhien07082001@gmail.com",
    "phone": null,
    "team": "HCM-Sale Đêm",
    "branch": "HCM",
    "shift": "Ca đêm",
    "shipping_position": null,
    "shipping_link": null,
    "team_sale_mar": "HIENDTT-Đ , HCM-CSKH , SALE - QUANTL , QUANTL-CS-N , HCM - Sale ngày , QUANTL-N , QUANTL-Đ"
  },
  {
    "id": "fgfdgd55",
    "full_name": "Nguyễn Đắc Công",
    "department": "Vận Hành",
    "position": "Leader",
    "email": "vhns@nashimart.io.vn",
    "phone": "0965310233",
    "team": null,
    "branch": "Hà Nội",
    "shift": "Ca Ngày",
    "shipping_position": null,
    "shipping_link": null,
    "team_sale_mar": null
  }
];

// Hàm xác định role từ position
function getRoleFromPosition(position) {
    if (!position) return 'user';
    const posLower = position.toLowerCase();
    if (posLower.includes('leader') || posLower.includes('trưởng')) return 'leader';
    if (posLower.includes('admin')) return 'admin';
    return 'user';
}

async function matchAndUpdateTeams() {
    console.log('🔄 Bắt đầu khớp và cập nhật team từ JSON...\n');

    // Tạo map email -> full data từ JSON
    const emailToDataMap = {};
    teamData.forEach(item => {
        if (item.email) {
            emailToDataMap[item.email.toLowerCase()] = item;
        }
    });

    // Tạo map email -> team từ JSON data
    const emailToTeamMap = {};
    teamData.forEach(item => {
        if (item.email && item.team) {
            emailToTeamMap[item.email.toLowerCase()] = item.team;
        }
    });

    console.log(`📋 Đã load ${Object.keys(emailToTeamMap).length} email từ JSON data`);
    console.log('📧 Danh sách email trong JSON:');
    Object.keys(emailToTeamMap).forEach(email => {
        console.log(`   - ${email} → Team: ${emailToTeamMap[email]}`);
    });
    console.log('');

    // Lấy tất cả users từ database
    console.log('📥 Đang lấy danh sách users từ database...');
    const { data: users, error: fetchError } = await supabase
        .from('users')
        .select('email, team, name');

    if (fetchError) {
        console.error('❌ Lỗi khi lấy danh sách users:', fetchError.message);
        return;
    }

    console.log(`✅ Đã lấy ${users.length} users từ database\n`);

    let updatedCount = 0;
    let notFoundCount = 0;
    let noChangeCount = 0;
    let createdCount = 0;
    const notFoundEmails = [];
    const updatedUsers = [];
    const createdUsers = [];

    // Duyệt qua từng user và cập nhật team
    for (const user of users) {
        const emailLower = user.email?.toLowerCase().trim();
        let newTeam = emailToTeamMap[emailLower];
        
        // Nếu không tìm thấy, thử tìm với các biến thể
        if (!newTeam) {
            // Thử tìm với email không có khoảng trắng
            const emailNoSpace = emailLower?.replace(/\s/g, '');
            newTeam = emailToTeamMap[emailNoSpace];
        }

        if (!newTeam) {
            notFoundCount++;
            notFoundEmails.push(user.email);
            continue;
        }

        // Kiểm tra xem team có thay đổi không
        if (user.team === newTeam) {
            noChangeCount++;
            continue;
        }

        // Cập nhật team
        console.log(`🔄 Cập nhật: ${user.email}`);
        console.log(`   Tên: ${user.name || 'N/A'}`);
        console.log(`   Team cũ: ${user.team || '(trống)'}`);
        console.log(`   Team mới: ${newTeam}`);

        const { error: updateError } = await supabase
            .from('users')
            .update({ team: newTeam })
            .eq('email', user.email);

        if (updateError) {
            console.error(`   ❌ Lỗi: ${updateError.message}\n`);
        } else {
            console.log(`   ✅ Đã cập nhật thành công\n`);
            updatedCount++;
            updatedUsers.push({
                email: user.email,
                name: user.name,
                oldTeam: user.team || '(trống)',
                newTeam: newTeam
            });
        }
    }

    // Hiển thị kết quả
    console.log('\n' + '='.repeat(60));
    console.log('📊 KẾT QUẢ CẬP NHẬT');
    console.log('='.repeat(60));
    console.log(`✅ Đã cập nhật team: ${updatedCount} users`);
    console.log(`🆕 Đã tạo mới: ${createdCount} users`);
    console.log(`⏭️  Không thay đổi: ${noChangeCount} users`);
    console.log(`❌ Không tìm thấy trong JSON: ${notFoundCount} users`);
    console.log(`📋 Tổng số users trong DB: ${users.length + createdCount}`);
    console.log(`📋 Tổng số email trong JSON: ${Object.keys(emailToTeamMap).length}`);

    if (updatedUsers.length > 0) {
        console.log('\n📝 Chi tiết các user đã cập nhật team:');
        console.log('-'.repeat(60));
        updatedUsers.forEach(u => {
            console.log(`Email: ${u.email}`);
            console.log(`Tên: ${u.name || 'N/A'}`);
            console.log(`Team: ${u.oldTeam} → ${u.newTeam}`);
            console.log('-'.repeat(60));
        });
    }

    if (createdUsers.length > 0) {
        console.log('\n🆕 Chi tiết các user đã tạo mới:');
        console.log('-'.repeat(60));
        createdUsers.forEach(u => {
            console.log(`Email: ${u.email}`);
            console.log(`Tên: ${u.name || 'N/A'}`);
            console.log(`Team: ${u.team || '(trống)'}`);
            console.log(`Password: ${u.password}`);
            console.log('-'.repeat(60));
        });
    }

    // Kiểm tra các email trong JSON có trong DB không và tạo mới nếu thiếu
    const jsonEmails = Object.keys(emailToTeamMap);
    const dbEmails = users.map(u => u.email?.toLowerCase().trim());
    const missingInDB = jsonEmails.filter(email => !dbEmails.includes(email));
    
    if (missingInDB.length > 0) {
        console.log('\n📝 Tạo mới các user chưa có trong database:');
        console.log('-'.repeat(60));
        
        const salt = bcrypt.genSaltSync(10);
        const defaultPassword = '123456';
        const hashedPassword = bcrypt.hashSync(defaultPassword, salt);

        for (const email of missingInDB) {
            const item = emailToDataMap[email];
            if (!item) continue;

            const username = email.split('@')[0];
            const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const role = getRoleFromPosition(item.position);

            console.log(`\n🆕 Đang tạo user: ${email}`);
            console.log(`   Tên: ${item.full_name || 'N/A'}`);
            console.log(`   Team: ${item.team || '(trống)'}`);
            console.log(`   Bộ phận: ${item.department || 'N/A'}`);
            console.log(`   Vị trí: ${item.position || 'N/A'}`);
            console.log(`   Role: ${role}`);

            const userData = {
                id: userId,
                username: username,
                email: item.email,
                name: item.full_name || '',
                password: hashedPassword,
                team: item.team || null,
                department: item.department || '',
                position: item.position || '',
                branch: item.branch || '',
                shift: item.shift || '',
                role: role,
                created_at: new Date().toISOString(),
                created_by: 'match-teams-script'
            };

            const { data: newUser, error: createError } = await supabase
                .from('users')
                .insert([userData])
                .select();

            if (createError) {
                console.error(`   ❌ Lỗi: ${createError.message}`);
            } else {
                console.log(`   ✅ Đã tạo thành công (Password: ${defaultPassword})`);
                createdCount++;
                createdUsers.push({
                    email: item.email,
                    name: item.full_name,
                    team: item.team,
                    password: defaultPassword
                });
            }
        }
    }

    if (notFoundEmails.length > 0 && notFoundEmails.length <= 20) {
        console.log('\n⚠️  Các email trong DB nhưng KHÔNG có trong JSON (hiển thị 20 đầu tiên):');
        notFoundEmails.slice(0, 20).forEach(email => {
            const user = users.find(u => u.email === email);
            console.log(`   - ${email} (${user?.name || 'N/A'})`);
        });
        if (notFoundEmails.length > 20) {
            console.log(`   ... và ${notFoundEmails.length - 20} email khác`);
        }
    }

    console.log('\n✅ Hoàn thành!');
}

// Chạy script
matchAndUpdateTeams().catch(error => {
    console.error('❌ Lỗi:', error);
    process.exit(1);
});
