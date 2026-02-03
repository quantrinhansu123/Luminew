import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSelectedPersonnel(email) {
  try {
    console.log(`\n🔍 Đang kiểm tra email: ${email}\n`);

    // 1. Lấy selected_personnel cho email này
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('email, name, selected_personnel')
      .eq('email', email.toLowerCase())
      .single();

    if (userError) {
      console.error('❌ Lỗi khi lấy dữ liệu user:', userError);
      return;
    }

    if (!userData) {
      console.log(`⚠️ Không tìm thấy user với email: ${email}`);
      return;
    }

    console.log('📋 Thông tin user:');
    console.log(`   Email: ${userData.email}`);
    console.log(`   Tên: ${userData.name || '(chưa có)'}`);
    console.log(`   selected_personnel:`, userData.selected_personnel);

    // 2. Kiểm tra selected_personnel
    let personnelEmails = [];
    
    if (userData.selected_personnel) {
      if (Array.isArray(userData.selected_personnel)) {
        personnelEmails = userData.selected_personnel;
      } else if (typeof userData.selected_personnel === 'string') {
        personnelEmails = userData.selected_personnel.split(',').map(e => e.trim()).filter(Boolean);
      }
    }

    console.log(`\n👥 Số lượng nhân sự đã chọn: ${personnelEmails.length}`);

    if (personnelEmails.length === 0) {
      console.log('ℹ️ Chưa có nhân sự nào được chọn trong cột "Nhân sự"');
      return;
    }

    console.log('\n📧 Danh sách email nhân sự:');
    personnelEmails.forEach((email, index) => {
      console.log(`   ${index + 1}. ${email}`);
    });

    // 3. Lấy tên của các nhân sự này
    const { data: personnelData, error: personnelError } = await supabase
      .from('users')
      .select('email, name, position, department, team')
      .in('email', personnelEmails);

    if (personnelError) {
      console.error('❌ Lỗi khi lấy thông tin nhân sự:', personnelError);
      return;
    }

    console.log(`\n📝 Danh sách tên nhân sự (${personnelData.length} người):\n`);
    
    if (personnelData.length === 0) {
      console.log('⚠️ Không tìm thấy thông tin cho các email nhân sự đã chọn');
      console.log('   Có thể các email này chưa có trong bảng users');
      return;
    }

    // Tạo map email -> name
    const emailToNameMap = {};
    personnelData.forEach(p => {
      emailToNameMap[p.email.toLowerCase()] = p.name || p.email;
    });

    // Hiển thị theo thứ tự trong selected_personnel
    personnelEmails.forEach((email, index) => {
      const emailLower = email.toLowerCase();
      const name = emailToNameMap[emailLower] || email;
      const person = personnelData.find(p => p.email.toLowerCase() === emailLower);
      
      console.log(`   ${index + 1}. ${name}`);
      console.log(`      Email: ${email}`);
      if (person) {
        console.log(`      Vị trí: ${person.position || '(chưa có)'}`);
        console.log(`      Bộ phận: ${person.department || '(chưa có)'}`);
        console.log(`      Team: ${person.team || '(chưa có)'}`);
      } else {
        console.log(`      ⚠️ Không tìm thấy trong bảng users`);
      }
      console.log('');
    });

    // Tóm tắt
    console.log('\n📊 Tóm tắt:');
    console.log(`   User: ${userData.name || userData.email}`);
    console.log(`   Số nhân sự đã chọn: ${personnelEmails.length}`);
    console.log(`   Số nhân sự tìm thấy trong DB: ${personnelData.length}`);
    
    if (personnelEmails.length > personnelData.length) {
      const missing = personnelEmails.filter(e => 
        !personnelData.some(p => p.email.toLowerCase() === e.toLowerCase())
      );
      console.log(`   ⚠️ Các email không tìm thấy: ${missing.join(', ')}`);
    }

  } catch (error) {
    console.error('❌ Lỗi:', error);
  }
}

// Chạy script
const emailToCheck = process.argv[2] || 'dangthinga0310@gmail.com';
checkSelectedPersonnel(emailToCheck)
  .then(() => {
    console.log('\n✅ Hoàn tất!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Lỗi:', error);
    process.exit(1);
  });
