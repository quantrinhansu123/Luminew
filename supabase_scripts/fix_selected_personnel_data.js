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

async function fixSelectedPersonnelData() {
  try {
    console.log('\n🔍 Đang kiểm tra và sửa dữ liệu selected_personnel...\n');

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

    console.log(`📊 Tìm thấy ${users.length} users có selected_personnel\n`);

    // 2. Lấy tất cả employees để map tên -> email
    const { data: allEmployees, error: empError } = await supabase
      .from('users')
      .select('email, name');

    if (empError) {
      console.error('❌ Lỗi khi lấy danh sách employees:', empError);
      return;
    }

    // Tạo map: tên -> email (có thể có nhiều email cho cùng tên)
    const nameToEmailsMap = {};
    allEmployees.forEach(emp => {
      const name = (emp.name || '').toLowerCase().trim();
      if (name) {
        if (!nameToEmailsMap[name]) {
          nameToEmailsMap[name] = [];
        }
        nameToEmailsMap[name].push(emp.email);
      }
    });

    // Tạo map: email -> name
    const emailToNameMap = {};
    allEmployees.forEach(emp => {
      emailToNameMap[emp.email.toLowerCase()] = emp.name || '';
    });

    let fixedCount = 0;
    let errorCount = 0;

    // 3. Kiểm tra và sửa từng user
    for (const user of users) {
      let personnelData = user.selected_personnel;
      
      // Chuyển đổi sang array nếu là string
      if (typeof personnelData === 'string') {
        personnelData = personnelData.split(',').map(e => e.trim()).filter(Boolean);
      } else if (!Array.isArray(personnelData)) {
        continue; // Skip nếu không phải array hoặc string
      }

      if (personnelData.length === 0) continue;

      const fixedEmails = [];
      const issues = [];

      for (const item of personnelData) {
        const itemStr = String(item).trim();
        
        // Kiểm tra xem có phải email không (có chứa @)
        if (itemStr.includes('@')) {
          // Đã là email, kiểm tra xem có tồn tại trong DB không
          const emailLower = itemStr.toLowerCase();
          if (emailToNameMap[emailLower]) {
            fixedEmails.push(emailLower);
          } else {
            issues.push(`Email không tồn tại: ${itemStr}`);
          }
        } else {
          // Có thể là tên, tìm email tương ứng
          const nameLower = itemStr.toLowerCase();
          const matchingEmails = nameToEmailsMap[nameLower] || [];
          
          if (matchingEmails.length === 1) {
            // Tìm thấy đúng 1 email
            fixedEmails.push(matchingEmails[0].toLowerCase());
            issues.push(`Đã chuyển tên "${itemStr}" → email "${matchingEmails[0]}"`);
          } else if (matchingEmails.length > 1) {
            // Tìm thấy nhiều email, giữ nguyên tên và cảnh báo
            issues.push(`⚠️ Tên "${itemStr}" khớp với nhiều email: ${matchingEmails.join(', ')}`);
            // Không thêm vào fixedEmails vì không biết chọn email nào
          } else {
            // Không tìm thấy
            issues.push(`❌ Không tìm thấy email cho: "${itemStr}"`);
          }
        }
      }

      // Loại bỏ duplicate
      const uniqueEmails = [...new Set(fixedEmails)];

      // Nếu có thay đổi hoặc có issues, cập nhật
      const originalStr = JSON.stringify(personnelData.sort());
      const fixedStr = JSON.stringify(uniqueEmails.sort());
      
      if (originalStr !== fixedStr || issues.length > 0) {
        console.log(`\n📧 User: ${user.email} (${user.name || 'N/A'})`);
        console.log(`   Trước: ${JSON.stringify(personnelData)}`);
        console.log(`   Sau:   ${JSON.stringify(uniqueEmails)}`);
        
        if (issues.length > 0) {
          console.log(`   ⚠️ Issues:`);
          issues.forEach(issue => console.log(`      - ${issue}`));
        }

        try {
          const { error: updateError } = await supabase
            .from('users')
            .update({ selected_personnel: uniqueEmails })
            .eq('email', user.email);

          if (updateError) {
            console.error(`   ❌ Lỗi khi cập nhật: ${updateError.message}`);
            errorCount++;
          } else {
            console.log(`   ✅ Đã cập nhật thành công`);
            fixedCount++;
          }
        } catch (err) {
          console.error(`   ❌ Lỗi: ${err.message}`);
          errorCount++;
        }
      }
    }

    console.log(`\n\n📊 Tóm tắt:`);
    console.log(`   ✅ Đã sửa: ${fixedCount} users`);
    console.log(`   ❌ Lỗi: ${errorCount} users`);
    console.log(`   📋 Tổng số users đã kiểm tra: ${users.length}`);

  } catch (error) {
    console.error('❌ Lỗi:', error);
  }
}

// Chạy script
fixSelectedPersonnelData()
  .then(() => {
    console.log('\n✅ Hoàn tất!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Lỗi:', error);
    process.exit(1);
  });
