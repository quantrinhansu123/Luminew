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

async function migrateSelectedPersonnelToNames() {
  try {
    console.log('\n🔄 Đang chuyển đổi selected_personnel từ email sang tên...\n');

    // 1. Lấy tất cả users có selected_personnel
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('email, name, selected_personnel')
      .not('selected_personnel', 'is', null);

    if (fetchError) {
      console.error('❌ Lỗi khi lấy dữ liệu:', fetchError);
      return;
    }

    if (!users || users.length === 0) {
      console.log('ℹ️ Không có user nào có selected_personnel');
      return;
    }

    // 2. Lấy tất cả employees để map email -> name
    const { data: allEmployees, error: empError } = await supabase
      .from('users')
      .select('email, name');

    if (empError) {
      console.error('❌ Lỗi khi lấy danh sách employees:', empError);
      return;
    }

    // Tạo map: email -> name
    const emailToNameMap = {};
    allEmployees.forEach(emp => {
      const email = emp.email.toLowerCase();
      const name = emp.name || '';
      if (name) {
        emailToNameMap[email] = name;
      }
    });

    console.log(`📊 Tìm thấy ${users.length} users có selected_personnel\n`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // 3. Convert từng user
    for (const user of users) {
      let personnelData = user.selected_personnel;
      
      // Chuyển đổi sang array nếu là string
      if (typeof personnelData === 'string') {
        personnelData = personnelData.split(',').map(e => e.trim()).filter(Boolean);
      } else if (!Array.isArray(personnelData)) {
        continue;
      }

      if (personnelData.length === 0) continue;

      const convertedNames = [];
      const issues = [];
      let hasEmail = false;

      for (const item of personnelData) {
        const itemStr = String(item).trim();
        
        // Kiểm tra xem có phải email không
        if (itemStr.includes('@')) {
          hasEmail = true;
          // Đây là email, cần convert sang tên
          const emailLower = itemStr.toLowerCase();
          const name = emailToNameMap[emailLower];
          
          if (name) {
            convertedNames.push(name);
            console.log(`   ✅ ${itemStr} → ${name}`);
          } else {
            issues.push(`Không tìm thấy tên cho email: ${itemStr}`);
            // Giữ nguyên email nếu không tìm thấy tên
            convertedNames.push(itemStr);
          }
        } else {
          // Đã là tên rồi, giữ nguyên
          convertedNames.push(itemStr);
        }
      }

      // Chỉ update nếu có email cần convert
      if (hasEmail) {
        const uniqueNames = [...new Set(convertedNames)];
        
        console.log(`\n📧 User: ${user.email} (${user.name || 'N/A'})`);
        console.log(`   Trước: ${JSON.stringify(personnelData)}`);
        console.log(`   Sau:   ${JSON.stringify(uniqueNames)}`);
        
        if (issues.length > 0) {
          console.log(`   ⚠️ Issues:`);
          issues.forEach(issue => console.log(`      - ${issue}`));
        }

        try {
          const { error: updateError } = await supabase
            .from('users')
            .update({ selected_personnel: uniqueNames })
            .eq('email', user.email);

          if (updateError) {
            console.error(`   ❌ Lỗi khi cập nhật: ${updateError.message}`);
            errorCount++;
          } else {
            console.log(`   ✅ Đã cập nhật thành công`);
            migratedCount++;
          }
        } catch (err) {
          console.error(`   ❌ Lỗi: ${err.message}`);
          errorCount++;
        }
      } else {
        console.log(`\n⏭️  User: ${user.email} - Đã là tên, bỏ qua`);
        skippedCount++;
      }
    }

    console.log(`\n\n📊 Tóm tắt:`);
    console.log(`   ✅ Đã chuyển đổi: ${migratedCount} users`);
    console.log(`   ⏭️  Đã bỏ qua (đã là tên): ${skippedCount} users`);
    console.log(`   ❌ Lỗi: ${errorCount} users`);
    console.log(`   📋 Tổng số users đã kiểm tra: ${users.length}`);

  } catch (error) {
    console.error('❌ Lỗi:', error);
  }
}

migrateSelectedPersonnelToNames()
  .then(() => {
    console.log('\n✅ Hoàn tất!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Lỗi:', error);
    process.exit(1);
  });
