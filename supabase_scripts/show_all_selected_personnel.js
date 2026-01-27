import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function showAllSelectedPersonnel() {
  try {
    console.log('\n🔍 Đang lấy tất cả dữ liệu selected_personnel...\n');

    // Lấy tất cả users có selected_personnel
    const { data: users, error } = await supabase
      .from('users')
      .select('email, name, selected_personnel')
      .not('selected_personnel', 'is', null);

    if (error) {
      console.error('❌ Lỗi:', error);
      return;
    }

    if (!users || users.length === 0) {
      console.log('ℹ️ Không có user nào có selected_personnel');
      return;
    }

    // Lấy tất cả employees để map
    const { data: allEmployees } = await supabase
      .from('users')
      .select('email, name');

    const emailToNameMap = {};
    allEmployees?.forEach(emp => {
      emailToNameMap[emp.email.toLowerCase()] = emp.name || '';
    });

    console.log(`📊 Tìm thấy ${users.length} users có selected_personnel:\n`);

    users.forEach((user, index) => {
      console.log(`\n${index + 1}. ${user.email} (${user.name || 'N/A'})`);
      console.log(`   selected_personnel:`, user.selected_personnel);
      
      if (Array.isArray(user.selected_personnel)) {
        console.log(`   Số lượng: ${user.selected_personnel.length}`);
        user.selected_personnel.forEach((item, idx) => {
          const itemStr = String(item).trim();
          const isEmail = itemStr.includes('@');
          const name = isEmail ? (emailToNameMap[itemStr.toLowerCase()] || 'Không tìm thấy') : itemStr;
          
          console.log(`   ${idx + 1}. ${itemStr} ${isEmail ? `(Email → Tên: ${name})` : '(Có vẻ là TÊN, không phải email!)'}`);
        });
      }
    });

  } catch (error) {
    console.error('❌ Lỗi:', error);
  }
}

showAllSelectedPersonnel()
  .then(() => {
    console.log('\n✅ Hoàn tất!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Lỗi:', error);
    process.exit(1);
  });
