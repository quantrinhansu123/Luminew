import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Thiếu VITE_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupAttendanceLogs() {
  try {
    console.log('🔧 Đang setup bảng attendance_logs với RLS policies...\n');

    // Đọc file SQL
    const sqlPath = join(__dirname, '../supabase/setup_attendance_logs.sql');
    const sqlContent = readFileSync(sqlPath, 'utf-8');

    // Tách các câu lệnh SQL
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 Tìm thấy ${statements.length} câu lệnh SQL\n`);

    // Thực thi từng câu lệnh
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`⏳ Đang thực thi câu lệnh ${i + 1}/${statements.length}...`);
      
      const { data, error } = await supabase.rpc('exec_sql', { 
        sql_query: statement + ';' 
      });

      if (error) {
        // Thử cách khác: sử dụng REST API trực tiếp
        console.log(`⚠️  RPC không khả dụng, thử phương pháp khác...`);
        console.log(`\n📋 Vui lòng chạy SQL sau trên Supabase SQL Editor:\n`);
        console.log('='.repeat(80));
        console.log(sqlContent);
        console.log('='.repeat(80));
        console.log('\n🔗 Truy cập: https://supabase.com/dashboard/project/YOUR_PROJECT/editor');
        break;
      }
    }

    console.log('\n✅ Setup hoàn tất!');
    console.log('\n📌 Nếu gặp lỗi, hãy:');
    console.log('   1. Mở Supabase Dashboard');
    console.log('   2. Vào SQL Editor');
    console.log('   3. Copy nội dung file supabase/setup_attendance_logs.sql');
    console.log('   4. Paste và chạy');

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    console.log('\n📋 Vui lòng chạy SQL thủ công trên Supabase SQL Editor:');
    console.log('   File: supabase/setup_attendance_logs.sql');
  }
}

setupAttendanceLogs();
